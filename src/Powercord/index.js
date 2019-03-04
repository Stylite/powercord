const EventEmitter = require('events');
const { get } = require('powercord/http');
const { sleep } = require('powercord/util');
const modules = require('./modules');
const PluginManager = require('./pluginManager');

module.exports = class Powercord extends EventEmitter {
  constructor () {
    super();

    this.pluginManager = new PluginManager();
    this.account = null;
    this.isLinking = false;
    this.patchWebSocket();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  patchWebSocket () {
    const _this = this;

    window.WebSocket = class PatchedWebSocket extends window.WebSocket {
      constructor (url) {
        super(url);

        this.addEventListener('message', (data) => {
          _this.emit(`webSocketMessage:${data.origin.slice(6)}`, data);
        });
      }
    };
  }

  async init () {
    await Promise.all(modules.map(mdl => mdl()));
    const isOverlay = (/overlay/).test(location.pathname);
    // In Discord client I have usually 21 entries in it. In the overlay I usually have 18 entries
    while (window.webpackJsonp.length < (isOverlay ? 18 : 21)) {
      await sleep(1);
    }

    const buildId = require('powercord/webpack').getModule([ '_originalConsoleMethods', '_wrappedBuiltIns' ])._globalOptions.release;
    this.buildInfo = `Release Channel: ${window.GLOBAL_ENV.RELEASE_CHANNEL} - Build Number: ${buildId}`;
    this.pluginManager.startPlugins();
    }
};
