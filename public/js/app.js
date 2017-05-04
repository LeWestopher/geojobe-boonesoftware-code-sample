(function () {
    window.App = function ([
        Map, 
        esriConfig, 
        ServiceAreaTask, 
        ServiceAreaParameters, 
        FeatureSet, 
        SimpleMarkerSymbol, 
        SimpleLineSymbol, 
        SimpleFillSymbol,
        Point, 
        Graphic,
        parser, 
        dom, 
        registry,
        Color, 
        arrayUtils
    ]) {

        // Declare our App level variables to contain the objects we will be working with
        let map, params, hslider, serviceAreaTask, clickpoint, mapEventHandler, renderLocation, renderPolygons;
        let sampleServerUrl = "https://sampleserver3.arcgisonline.com/ArcGIS/rest/services/Network/USA/NAServer/Service Area";

        // Kick off our Esri application
        bootstrap();

        /**
         * Bootstraps our application.  Does the following:
         * 
         * 1. Creates our ServiceAreaTask object for calling the API to get service area.
         * 2. Creates our click handler for our map and applies the service area task via currying.
         * 3. Creates our 'map' object and applies our previously created click event handler.
         * 4. Builds our location and polygons render functions with our 'map' object via currying.
         * 5. Creates our 'params' object and extends some relevant properties to it.
         * 6. Applies a change event handler to our horizontal slider we use in the UI.
         */
        function bootstrap() {
            parser.parse();
            esriConfig.defaults.io.proxyUrl = "/proxy/";

            // 1. Creates our ServiceAreaTask object for calling the API to get service area.
            serviceAreaTask = compose(
                createServiceAreaTask(sampleServerUrl)
            )();

            // 2. Creates our click handler for our map and applies the service area task via currying.
            mapEventHandler = createMapEventHandler(serviceAreaTask);

            // 3. Creates our 'map' object and applies our previously created click event handler.
            map = compose(
                createMap("map", {
                    basemap: "streets",
                    center: [-122.447, 37.781],
                    zoom: 15                
                }),
                applyEventHandler("click", mapEventHandler)
            )();

            // 4. Builds our location and polygons render functions with our 'map' object via currying.
            renderLocation = getLocationRenderer(map);
            renderPolygons = getPolygonRenderer(map);

            // 5. Creates our 'params' object and extends some relevant properties to it.
            params = compose(
                createServiceAreaParameters(),
                extendParams({
                    defaultBreaks: [1],
                    outSpatialReference: map.spatialReference,
                    returnFacilities: false
                })
            )();

            // 6. Applies a change event handler to our horizontal slider we use in the UI.
            hslider = compose(
                fetchFromRegistryById("hslider"),
                applyEventHandler("change", updateHorizontalLabel)
            )();
        }
        /**
         * Takes a variadic list of functions and returns a function composition
         * @param {*} fns 
         */
        function compose(...fns) {
            return fns
                .reverse()
                .reduce((f, g) => (...args) => f(g(...args)))
        }
        /**
         * Returns our public hslider object
         */
        function fetchHslider() {
            return () => hslider;
        }
        /**
         * Curried Map factory.  Allows the creation of a Map object in line with a composed function.
         * @param {*} selector 
         * @param {*} config 
         */
        function createMap(selector, config) {
            return () => new Map(selector, config);
        }
        /**
         * Curried SericeAreaParameters factory.  Allows creation of object in line with a composed function.
         */
        function createServiceAreaParameters() {
            return () => new ServiceAreaParameters();
        }
        /**
         * Curried ServiceAreaTask factory.
         * @param {*} url 
         */
        function createServiceAreaTask(url) {
            return () => new ServiceAreaTask(url);
        }
        /**
         * Curried function for building a click event handler for the map object by applying the previously
         * created serviceAreaTask object as an argument.
         * @param {*} serviceAreaTask 
         */
        function createMapEventHandler(serviceAreaTask) {
            return evt => {

                try {
                    let location = renderLocation(evt);
                    params.facilities = createFacilityList(location);
                } catch (e) {
                    handleError(e);
                }

                getTaskSolver(serviceAreaTask)(params)
                    .then(renderPolygons)
                    .catch(handleError);
            }
        }
        /**
         * Creates a facility list based on a location passed in as an argument
         * @param {*} location 
         */
        function createFacilityList(location) {
            let facilities = new FeatureSet();
            facilities.features = [location];
            return facilities;
        }
        /**
         * Returns a curried render function based on a previously built 'map' object.
         * The returned function will render the map based on click events on the map itself.
         * @param {*} map 
         */
        function getLocationRenderer(map) {
            return evt => {
                clickpoint = evt;
                map.graphics.clear();
                let pointSymbol = new SimpleMarkerSymbol(
                    "diamond",
                    20,
                    new SimpleLineSymbol("solid", new Color([88,116,152]), 2),
                    new Color([88,116,152,0.45])
                );
                let inPoint = new Point(evt.mapPoint.x, evt.mapPoint.y, map.spatialReference);
                let location = new Graphic(inPoint, pointSymbol);
                map.graphics.add(location);
                return location;
            }
        }
        /**
         * Returns a curried polygon render function based on a previously built 'map' object.
         * The returned function will render polygons based on the result of the serviceAreaTask
         * @param {*} map 
         */
        function getPolygonRenderer(map) {
            return serviceAreaTaskResult => {
                let polygonSymbol = new SimpleFillSymbol(
                    "solid",  
                    new SimpleLineSymbol("solid", new Color([232,104,80]), 2),
                    new Color([232,104,80,0.25])
                );
                serviceAreaTaskResult.serviceAreaPolygons.forEach(serviceArea => {
                    serviceArea.setSymbol(polygonSymbol);
                    map.graphics.add(serviceArea);
                });
            }
        }
        /**
         * Updates the label up top
         */
        function updateHorizontalLabel() {
            let hSlider = registry.byId("hslider");
            let label = dom.byId("decValue");
            label.innerHTML = hSlider.get("value");
            params.defaultBreaks = [ hSlider.value / 60 ];
            if (clickpoint) {
                mapEventHandler(clickpoint);
            }
        }
        /**
         * Curried function that returns a task solver based on a serviceAreaTask passed in as arg 1
         * @param {*} serviceAreaTask 
         */
        function getTaskSolver(serviceAreaTask) {
            return params => new Promise((resolve, reject) => {
                serviceAreaTask.solve(params, result => resolve(result), err => reject(err));
            })
        }
        /**
         * Curried function to extend parameters onto an object inside of a function composition
         * @param {*} params 
         */
        function extendParams(params) {
            return target => Object.assign(target, params);
        }
        /**
         * Curried function to apply an event handler to an object inside of a function composition
         * @param {*} event 
         * @param {*} handler 
         */
        function applyEventHandler(event, handler) {
            return el => {
                el.on(event, handler);
                return el;
            }
        }
        /**
         * Curried function to return a dom element from the page inside of a function composition
         * @param {*} id 
         */
        function fetchFromRegistryById(id) {
            return () => registry.byId(id);
        }
        /**
         * Generic error handler
         * @param {*} error 
         */
        function handleError(error) {
            console.log('[ERROR] ' + error.message);
        }

    }

}());