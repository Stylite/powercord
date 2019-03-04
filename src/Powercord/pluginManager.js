const { resolve } = require('path');
const { readdirSync } = require('fs');
const { get } = require('powercord/http');
const { rmdirRf } = require('powercord/util');

const { promisify } = require('util');
const cp = require('child_process');
const exec = promisify(cp.exec);

module.exports = class PluginManager {
  constructor () {
    this.pluginDir = resolve(__dirname, 'plugins');
    this.plugins = new Map();

    this.manifestKeys = [ 'name', 'version', 'description', 'author', 'license', 'repo' ];
    this.enforcedPlugins = [ 'pc-styleManager', 'pc-pluginManager', 'pc-keybindManager' ];
  }

  // Getters
  get (pluginID) {
    return this.plugins.get(pluginID);
  }

  async getPluginName (pluginID) {
    const plugin = this.get(pluginID);
    if (plugin) {
      return plugin.manifest.name;
    }
    }

  getPlugins () {
    return Array.from(this.plugins.keys());
  }

  getAllPlugins () {
    return Array.from(this.plugins.keys());
  }

  isInstalled (plugin) {
    return this.plugins.has(plugin);
  }

  isEnforced (plugin, iterate = true) {
    if (this.enforcedPlugins.includes(plugin)) {
      return true;
    }

    if (!iterate) {
      return false;
    }

    const dependents = this.resolveDependents(plugin);
    return dependents.filter(p => this.isEnforced(p, false)).length !== 0;
  }

  // Resolvers
  async resolveDependencies (plugin, deps = []) {
    const dependencies = await this.getDependencies(plugin);

    await Promise.all(dependencies.map(async dep => {
      if (!deps.includes(dep)) {
        deps.push(dep);
        deps.push(...(await this.resolveDependencies(dep, deps)));
      }
    }));
    return deps.filter((d, p) => deps.indexOf(d) === p);
  }

  resolveDependents (plugin, dept = []) {
    const dependents = this.getAllPlugins().filter(p => this.getDependenciesSync(p).includes(plugin));
    dependents.forEach(dpt => {
      if (!dept.includes(dpt)) {
        dept.push(dpt);
        dept.push(...this.resolveDependents(dpt, dept));
      }
    });
    return dept.filter((d, p) => dept.indexOf(d) === p);
  }

  async getDependencies (pluginID) {
    const plugin = this.get(pluginID);
    if (plugin) {
      return plugin.manifest.dependencies;
    }
  }

  getDependenciesSync (pluginID) {
    const plugin = this.get(pluginID);
    if (plugin) {
      return plugin.manifest.dependencies;
    }
    // Just return empty array
    return [];
  }

  // Mount/load/enable/install/hide shit
  mount (pluginID) {
    let manifest;
    try {
      manifest = Object.assign({
        appMode: 'app',
        dependencies: []
      }, require(resolve(this.pluginDir, pluginID, 'manifest.json')));
    } catch (e) {
      return console.error('%c[Powercord]', 'color: #257dd4', `Plugin ${pluginID} doesn't have a valid manifest - Skipping`);
    }

    if (!this.manifestKeys.every(key => manifest.hasOwnProperty(key))) {
      return console.error('%c[Powercord]', 'color: #257dd4', `Plugin "${pluginID}" doesn't have a valid manifest - Skipping`);
    }

    try {
      const PluginClass = require(resolve(this.pluginDir, pluginID));

      Object.defineProperties(PluginClass.prototype, {
        pluginID: {
          get: () => pluginID,
          set: () => {
            throw new Error('Plugins cannot update their ID at runtime!');
          }
        },
        manifest: {
          get: () => manifest,
          set: () => {
            throw new Error('Plugins cannot update manifest at runtime!');
          }
        }
      });

      this.plugins.set(pluginID, new PluginClass());
    } catch (e) {
      console.error('%c[Powercord]', 'color: #257dd4', `An error occurred while initializing "${pluginID}"!`, e);
    }
  }

  async remount (pluginID) {
    try {
      await this.unmount(pluginID);
    } catch (e) {
      // chhhh
    }
    this.mount(pluginID);
    this.plugins.get(pluginID)._start();
  }

  async unmount (pluginID) {
    const plugin = this.get(pluginID);
    if (!plugin) {
      throw new Error(`Tried to unmount a non installed plugin (${plugin})`);
    }
    if (plugin.ready) {
      await plugin._unload();
    }

    Object.keys(require.cache).forEach(key => {
      if (key.includes(pluginID)) {
        delete require.cache[key];
      }
    });
    this.plugins.delete(pluginID);
  }

  load (pluginID) {
    const plugin = this.get(pluginID);
    if (!plugin) {
      throw new Error(`Tried to load a non installed plugin (${plugin})`);
    }
    if (plugin.ready) {
      return console.error('%c[Powercord]', 'color: #257dd4', `Tried to load an already loaded plugin (${pluginID})`);
    }

    plugin._start();
  }

  unload (pluginID) {
    const plugin = this.get(pluginID);
    if (!plugin) {
      throw new Error(`Tried to unload a non installed plugin (${plugin})`);
    }
    if (!plugin.ready) {
      return console.error('%c[Powercord]', 'color: #257dd4', `Tried to unload a non loaded plugin (${plugin})`);
    }

    plugin._unload();
  }

  enable (pluginID) {
    if (!this.get(pluginID)) {
      throw new Error(`Tried to unload a non installed plugin (${pluginID})`);
    }

    this.load(pluginID);
  }

  disable (pluginID) {
    const plugin = this.get(pluginID);

    if (!plugin) {
      throw new Error(`Tried to unload a non installed plugin (${pluginID})`);
    }
    if (this.enforcedPlugins.includes(pluginID)) {
      throw new Error(`You cannot disable an enforced plugin. (Tried to disable ${pluginID})`);
    }

    this.unload(pluginID);
  }

  async install (pluginID) {
    await exec(`git clone https://github.com/powercord-org/${pluginID}`, this.pluginDir);
    this.mount(pluginID);
  }

  async uninstall (pluginID) {
    if (this.enforcedPlugins.includes(pluginID)) {
      throw new Error(`You cannot uninstall an enforced plugin. (Tried to uninstall ${pluginID})`);
    }

    if (pluginID.startsWith('pc-')) {
      throw new Error(`You cannot uninstall an internal plugin. (Tried to uninstall ${pluginID})`);
    }

    await this.unmount(pluginID);
    await rmdirRf(resolve(this.pluginDir, pluginID));
  }

  // Start
  startPlugins () {
    const isOverlay = (/overlay/).test(location.pathname);
    readdirSync(this.pluginDir).forEach(filename => this.mount(filename));
    for (const plugin of [ ...this.plugins.values() ]) {
      if (
        (plugin.manifest.appMode === 'overlay' && isOverlay) ||
        (plugin.manifest.appMode === 'app' && !isOverlay) ||
        plugin.manifest.appMode === 'both'
      ) {
        this.load(plugin.pluginID);
      } else {
        this.plugins.delete(plugin);
      }
    }
  }
};
