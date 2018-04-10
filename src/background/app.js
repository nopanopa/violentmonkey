import 'src/common/browser';
import { noop } from 'src/common';
import { objectGet } from 'src/common/object';
import * as sync from './sync';
import {
  cache,
  getRequestId, httpRequest, abortRequest, confirmInstall,
  newScript, parseMeta,
  setClipboard, checkUpdate,
  getOption, setOption, hookOptions, getAllOptions,
  initialize, sendMessageOrIgnore,
} from './utils';
import { tabOpen, tabClose } from './utils/tabs';
import createNotification from './utils/notifications';
import {
  getScripts, removeScript, getData, checkRemove, getScriptsByURL,
  updateScriptInfo, getExportData, getScriptCode,
  getScriptByIds, moveScript, vacuum, parseScript, getScript,
  sortScripts, getValueStoresByIds,
} from './utils/db';
import { resetBlacklist } from './utils/tester';
import { setValueStore, updateValueStore, resetValueOpener, addValueOpener } from './utils/values';

const VM_VER = browser.runtime.getManifest().version;

hookOptions(changes => {
  if ('isApplied' in changes) setIcon(changes.isApplied);
  if ('autoUpdate' in changes) autoUpdate();
  if ('showBadge' in changes) updateBadges();
  sendMessageOrIgnore({
    cmd: 'UpdateOptions',
    data: changes,
  });
});

function checkUpdateAll() {
  setOption('lastUpdate', Date.now());
  getScripts()
  .then(scripts => {
    const toUpdate = scripts.filter(item => objectGet(item, 'config.shouldUpdate'));
    return Promise.all(toUpdate.map(checkUpdate));
  })
  .then(updatedList => {
    if (updatedList.some(Boolean)) sync.sync();
  });
}

let autoUpdating;
function autoUpdate() {
  if (autoUpdating) return;
  autoUpdating = true;
  check();
  function check() {
    new Promise((resolve, reject) => {
      if (!getOption('autoUpdate')) return reject();
      if (Date.now() - getOption('lastUpdate') >= 864e5) resolve(checkUpdateAll());
    })
    .then(() => setTimeout(check, 36e5), () => { autoUpdating = false; });
  }
}

const commands = {
  NewScript() {
    return newScript();
  },
  RemoveScript(id) {
    return removeScript(id)
    .then(() => { sync.sync(); });
  },
  GetData(clear) {
    return (clear ? checkRemove() : Promise.resolve())
    .then(getData)
    .then(data => {
      data.sync = sync.getStates();
      data.version = VM_VER;
      return data;
    });
  },
  GetInjected({ url, reset }, src) {
    const srcTab = src.tab || {};
    if (reset && srcTab.id) resetValueOpener(srcTab.id);
    const data = {
      isApplied: getOption('isApplied'),
      version: VM_VER,
    };
    if (!data.isApplied) return data;
    return getScriptsByURL(url)
    .then(res => {
      addValueOpener(srcTab.id, Object.keys(res.values));
      return Object.assign(data, res);
    });
  },
  UpdateScriptInfo({ id, config }) {
    return updateScriptInfo(id, {
      config,
      props: {
        lastModified: Date.now(),
      },
    })
    .then(([script]) => {
      sync.sync();
      sendMessageOrIgnore({
        cmd: 'UpdateScript',
        data: {
          where: { id: script.props.id },
          update: script,
        },
      });
    });
  },
  GetValueStore(id) {
    return getValueStoresByIds([id]).then(res => res[id] || {});
  },
  SetValueStore({ where, valueStore }) {
    // Value store will be replaced soon.
    return setValueStore(where, valueStore);
  },
  UpdateValue({ id, update }) {
    // Value will be updated to store later.
    return updateValueStore(id, update);
  },
  ExportZip({ ids, values }) {
    return getExportData(ids, values);
  },
  GetScriptCode(id) {
    return getScriptCode(id);
  },
  GetMetas(ids) {
    return getScriptByIds(ids);
  },
  Move({ id, offset }) {
    return moveScript(id, offset)
    .then(() => {
      sync.sync();
    });
  },
  Vacuum: vacuum,
  ParseScript(data) {
    return parseScript(data).then(res => {
      sendMessageOrIgnore(res);
      sync.sync();
      return res.data;
    });
  },
  CheckUpdate(id) {
    getScript({ id }).then(checkUpdate)
    .then(updated => {
      if (updated) sync.sync();
    });
  },
  CheckUpdateAll: checkUpdateAll,
  ParseMeta(code) {
    return parseMeta(code);
  },
  GetRequestId: getRequestId,
  HttpRequest(details, src) {
    httpRequest(details, res => {
      browser.tabs.sendMessage(src.tab.id, {
        cmd: 'HttpRequested',
        data: res,
      })
      .catch(noop);
    });
  },
  AbortRequest: abortRequest,
  SetBadge: setBadge,
  SyncAuthorize: sync.authorize,
  SyncRevoke: sync.revoke,
  SyncStart: sync.sync,
  CacheLoad(data) {
    return cache.get(data) || null;
  },
  CacheHit(data) {
    cache.hit(data.key, data.lifetime);
  },
  Notification: createNotification,
  SetClipboard: setClipboard,
  TabOpen: tabOpen,
  TabClose: tabClose,
  GetAllOptions: getAllOptions,
  GetOptions(data) {
    return data.reduce((res, key) => {
      res[key] = getOption(key);
      return res;
    }, {});
  },
  SetOptions(data) {
    const items = Array.isArray(data) ? data : [data];
    items.forEach(item => { setOption(item.key, item.value); });
  },
  ConfirmInstall: confirmInstall,
  CheckScript({ name, namespace }) {
    return getScript({ meta: { name, namespace } })
    .then(script => (script ? script.meta.version : null));
  },
  CheckPosition() {
    return sortScripts();
  },
};

initialize()
.then(() => {
  browser.runtime.onMessage.addListener((req, src) => {
    const func = commands[req.cmd];
    let res;
    if (func) {
      res = func(req.data, src);
      if (typeof res !== 'undefined') {
        // If res is not instance of native Promise, browser APIs will not wait for it.
        res = Promise.resolve(res)
        .then(data => ({ data }), error => {
          if (process.env.DEBUG) console.error(error);
          return { error };
        });
      }
    }
    // undefined will be ignored
    return res || null;
  });
  setTimeout(autoUpdate, 2e4);
  sync.initialize();
  resetBlacklist();
  checkRemove();
});

// Common functions

const badges = {};
function setBadge({ ids, reset }, src) {
  const srcTab = src.tab || {};
  let data = !reset && badges[srcTab.id];
  if (!data) {
    data = {
      number: 0,
      unique: 0,
      idMap: {},
    };
    badges[srcTab.id] = data;
  }
  data.number += ids.length;
  if (ids) {
    ids.forEach(id => {
      data.idMap[id] = 1;
    });
    data.unique = Object.keys(data.idMap).length;
  }
  browser.browserAction.setBadgeBackgroundColor({
    color: '#808',
    tabId: srcTab.id,
  });
  updateBadge(srcTab.id);
}
function updateBadge(tabId) {
  const data = badges[tabId];
  if (data) {
    const showBadge = getOption('showBadge');
    let text;
    if (showBadge === 'total') text = data.number;
    else if (showBadge) text = data.unique;
    browser.browserAction.setBadgeText({
      text: `${text || ''}`,
      tabId,
    });
  }
}
function updateBadges() {
  browser.tabs.query({})
  .then(tabs => {
    tabs.forEach(tab => {
      updateBadge(tab.id);
    });
  });
}
browser.tabs.onRemoved.addListener(id => {
  delete badges[id];
});

function setIcon(isApplied) {
  browser.browserAction.setIcon({
    path: {
      19: `/public/images/icon19${isApplied ? '' : 'w'}.png`,
      38: `/public/images/icon38${isApplied ? '' : 'w'}.png`,
    },
  });
}
setIcon(getOption('isApplied'));
