(function () {
  const modules = {};

  function register(name, value) {
    if (!name) throw new Error('Module name is required.');
    modules[name] = value;
    return value;
  }

  function get(name) {
    return modules[name];
  }

  function requireModule(name) {
    const value = modules[name];
    if (!value) throw new Error(`Required module not registered: ${name}`);
    return value;
  }

  function has(name) {
    return !!modules[name];
  }

  function list() {
    return Object.keys(modules);
  }

  window.StructuralCalcModules = { register, get, require: requireModule, has, list };
})();
