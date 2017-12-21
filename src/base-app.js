import {withMiddleware} from './with-middleware';
import {withDependencies} from './with-dependencies';

class FusionApp {
  constructor() {
    this.registered = new Map();
    this.plugins = [];
  }
  register(token, Plugin) {
    if (Plugin === undefined) {
      Plugin = token;
    }
    this.plugins.push(token);
    const aliases = new Map();
    this.registered.set(token, {Plugin, aliases});
    function alias(sourceToken, destToken) {
      aliases.set(sourceToken, destToken);
      return {alias};
    }
    return {alias};
  }
  configure(token, value) {
    this.registered.set(token, {Plugin: value, aliases: new Map()});
  }
  middleware(deps, middleware) {
    if (middleware === undefined) {
      middleware = deps;
      this.register(withMiddleware(middleware));
    } else {
      this.register(
        withDependencies(deps)(d => {
          return withMiddleware(middleware(d));
        })
      );
    }
  }
  resolve() {
    this.register(this.renderer);
    const resolved = new Map();
    const resolving = new Set();
    const registered = this.registered;
    const resolvedPlugins = [];
    // TODO: maybe could turn this into a map
    function resolveToken(token, tokenAliases) {
      // if we have already resolved the type, return it
      if (tokenAliases && tokenAliases.has(token)) {
        token = tokenAliases.get(token);
      }
      if (resolved.has(token)) {
        return resolved.get(token);
      }
      // if currently resolving the same type, we have a circular dependency
      if (resolving.has(token)) {
        throw new Error(
          `Cannot resolve circular dependency: ${token.toString()}`
        );
      }
      // the type was never registered, throw error
      if (!registered.has(token)) {
        // Attempt to get default value
        registered.set(token, {Plugin: token(), aliases: new Map()});
      }
      // get the registered type and resolve it
      resolving.add(token);
      let {Plugin, aliases} = registered.get(token);
      if (
        typeof Plugin === 'function' &&
        typeof Plugin.__middleware__ !== 'function'
      ) {
        const registeredDeps = Plugin.__deps__ || {};
        const resolvedDeps = {};
        for (const key in registeredDeps) {
          const registeredToken = registeredDeps[key];
          resolvedDeps[key] = resolveToken(registeredToken, aliases);
        }
        // TODO: should we always call the function or only when the plugin
        // is used with `withDependencies`?
        Plugin = Plugin(resolvedDeps);
      }
      resolved.set(token, Plugin);
      resolving.delete(token);
      resolvedPlugins.push(Plugin);
      return Plugin;
    }
    for (let i = 0; i < this.plugins.length; i++) {
      resolveToken(this.plugins[i]);
    }

    // TODO: potentially unnecessary
    this.plugins = resolvedPlugins;
  }
}

export default FusionApp;
