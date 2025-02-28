<template>
  <div class="edit-externals flex flex-col">
    <div v-if="!install || all.length > 1" class="select"
         :data-has-main="install ? '' : null">
      <dl v-for="([type, url, contents], i) of all" :key="i"
          class="flex"
          :class="{
            active: index === i,
            loading: install && i && contents == null,
            error: contents === false,
          }"
          @click="contents !== false && (index = i)">
        <dt v-text="type"/>
        <dd class="ellipsis flex-1">
          <a :href="url" target="_blank">&nearr;</a>
          <span v-text="decodeURIComponent(url)"/>
        </dd>
        <dd v-if="contents" v-text="formatLength(contents, type)" class="ml-2"/>
      </dl>
    </div>
    <div class="contents pos-rel flex-1">
      <img v-if="img" :src="img">
      <vm-code
        v-show="!img"
        class="abs-full"
        v-model="code"
        ref="code"
        readonly
        :cm-options="cmOptions"
        :mode="mode"
      />
    </div>
  </div>
</template>

<script>
import { formatByteLength, dataUri2text } from '#/common';
import VmCode from '#/common/ui/code';
import storage from '#/common/storage';

export default {
  props: ['value', 'cmOptions', 'commands', 'install', 'errors'],
  components: { VmCode },
  computed: {
    all() {
      const { code, deps = this.deps, url: mainUrl } = this.install || {};
      const { require = [], resources = {} } = this.value.meta || {};
      return [
        ...mainUrl ? [[this.i18n('editNavCode'), mainUrl, code]] : [],
        ...require.map(url => ['@require', url, deps[`0${url}`]]),
        ...Object.entries(resources).map(([id, url]) => [`@resource ${id}`, url, deps[`1${url}`]]),
      ];
    },
  },
  data() {
    return {
      code: null,
      deps: {},
      img: null,
      index: null,
      mode: null,
    };
  },
  watch: {
    async index(index) {
      const [type, url] = this.all[index] || [];
      if (!url) return;
      const { install } = this;
      const isMain = install && !index;
      const isDataUri = url.startsWith('data:');
      const isReq = !isMain && !isDataUri && type === '@require';
      const depsUrl = `${+!isReq}${url}`;
      let code;
      let contentType;
      let img;
      let raw;
      if (isMain) {
        code = install.code;
      } else {
        if (isDataUri) {
          raw = url;
        } else if (install) {
          raw = install.deps[depsUrl];
        } else {
          const key = this.value.custom.pathMap?.[url] || url;
          raw = await storage[isReq ? 'require' : 'cache'].getOne(key);
          if (!isReq) raw = storage.cache.makeDataUri(key, raw);
        }
        if (isReq || !raw) {
          code = raw;
        } else if (raw.startsWith('data:image')) {
          img = raw;
        } else {
          [contentType, code] = raw.split(',');
          if (code == null) { // workaround for bugs in old VM, see 2e135cf7
            const fileExt = url.match(/\.(\w+)([#&?]|$)/)?.[1] || '';
            contentType = /^(png|jpe?g|bmp|svgz?|gz|zip)$/i.test(fileExt)
              ? ''
              : `text/${fileExt.toLowerCase()}`;
          } else if (contentType) {
            contentType = contentType.split(/[:;]/)[1];
          }
          code = dataUri2text(`${contentType};base64,${code}`);
        }
      }
      this.img = img;
      this.mode = contentType === 'text/css' || /\.css([#&?]|$)/i.test(url) ? 'css' : null;
      this.code = code;
      this.$set(this.deps, depsUrl, code);
    },
    'install.code'(val) {
      this.code = val;
    },
    value() {
      this.$nextTick(() => {
        if (this.index >= this.all.length) this.index = 0;
      });
    },
  },
  async mounted() {
    this.index = 0;
  },
  methods: {
    formatLength(str, type) {
      let len = str?.length;
      if (type.startsWith('@resource')) {
        len = Math.round((len - str.indexOf(',') - 1) * 6 / 8); // base64 uses 6 bits out of 8
      }
      return formatByteLength(len);
    },
  },
};
</script>

<style>
$outerPadX: 1rem;
$mainEntryBorder: 6px double;
.edit-externals {
  --border: $mainEntryBorder var(--fill-8);
  border-top: var(--border);
  > .select {
    min-height: 1.25rem;
    max-height: 15vh;
    overflow-y: auto;
    border-bottom: 2px solid var(--fill-3);
    padding-bottom: calc($outerPadX/2);
    &[data-has-main] dl:first-child {
      padding-top: .5em;
      padding-bottom: .5em;
      border-bottom: 1px solid var(--fill-3);
      position: sticky;
      top: 0;
      background: var(--bg);
    }
    dl {
      padding-right: $outerPadX;
      align-items: center;
      white-space: nowrap;
      &.active {
        font-weight: bold;
        color: blue;
      }
      &.loading dd {
        color: var(--fill-7);
      }
      &.error dd {
        color: red;
      }
      &:not(.error) {
        cursor: pointer;
        &:hover dd {
          text-decoration: underline;
          a {
            text-decoration: none;
          }
        }
      }
    }
    dt {
      color: darkblue;
      margin-left: $outerPadX;
      font-family: monospace;
    }
    a {
      padding: 0 .5em;
      cursor: alias;
      &:hover {
        background: var(--fill-3);
      }
    }
  }
  > .contents {
    > img {
      padding: 1rem;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
  }
  @media (prefers-color-scheme: dark) {
    .select {
      &.error dd {
        color: #ff4747;
      }
      dl.active {
        color: coral;
        dt {
          color: hotpink;
        }
      }
      dt {
        color: #c34ec3;
      }
    }
  }
}
</style>
