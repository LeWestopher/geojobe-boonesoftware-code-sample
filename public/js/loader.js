(function () {
    let EL = window.EsriLoader = {};

    EL.require = mod => 
        new Promise((resolve, reject) => 
            require(mod, (...loaded) => 
                resolve(loaded)));
}());