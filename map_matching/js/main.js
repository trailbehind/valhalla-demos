var app = angular.module('optimized_route', []);
var hash_params = L.Hash.parseHash(location.hash);

var envServer = "production";
var envToken = accessToken.prod;
var serviceUrl = server.prod;
var sentManyToManyEnd = false;
var optimized_route = true;

function selectEnv() {
    $("#env_dropdown").find("option:selected").each(function() {
        envServer = $(this).text();
        getEnvToken();
    });
}

selectEnv();

function handleChange(evt) {
    var sel = document.getElementById('selector');
    for (var i = 0; i < sel.options.length; i++) {
        var results = sel.options[i].text + "  " + sel.options[i].value;
        sel.options[i].innerHTML = results;
    }
}

function getEnvToken() {
    switch (envServer) {
    case "localhost":
        envToken = accessToken.local;
        serviceUrl = server.local;
        break;
    case "development":
        envToken = accessToken.dev;
        serviceUrl = server.dev;
        break;
    case "production":
        envToken = accessToken.prod;
        serviceUrl = server.prod;
        break;
    }
}

app.run(function($rootScope) {
    var hash_loc = hash_params ? hash_params : {
        center : {
            lat : 40.7486,
            lng : -73.9690
        },
        zoom : 13
    };
    $rootScope.geobase = {
        zoom : hash_loc.zoom,
        lat : hash_loc.center.lat,
        lon : hash_loc.center.lng
    };
    $(document).on('new-location', function(e) {
        $rootScope.geobase = {
            zoom : e.zoom,
            lat : e.lat,
            lon : e.lon
        };
    });
});


//hooks up to the div whose data-ng-controller attribute matches this name
app.controller('OptimizedRouteController', function($scope, $rootScope, $sce, $http) {
    var road = L.tileLayer('http://b.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution : '&copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributers'
    }), zinc = Tangram.leafletLayer({
        scene: 'https://raw.githubusercontent.com/valhalla/demos/gh-pages/routing/map_style/zinc-basemap.yaml',
        attribution: '<a href="https://mapzen.com/tangram">Tangram</a> | &copy; OSM contributors | <a href="https://mapzen.com/">Mapzen</a>'
    }), cycle = L.tileLayer('http://b.tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=f8f13e0070864ac3ad996f7bf7beb9af', {
        attribution : 'Maps &copy; <a href="http://www.thunderforest.com">Thunderforest, </a>;Data &copy; <a href="http://openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    }), elevation = L.tileLayer('http://b.tile.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=f8f13e0070864ac3ad996f7bf7beb9af', {
        attribution : 'Maps &copy; <a href="http://www.thunderforest.com">Thunderforest, </a>;Data &copy; <a href="http://openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    });

    var mapMatchingControl;

    var mapMatch = function () {
        var traceCoords = $scope.endPoints.map(function(gLoc) {
            return [parseFloat(gLoc.lon), parseFloat(gLoc.lat)];
        });

        var trace = {
            type: 'MultiPoint',
            coordinates: traceCoords
        };

        if (mapMatchingControl) {
            mapMatchingControl.removeFrom(map);
        }
        mapMatchingControl = L.mapMatching(trace, {
            externalTraceLayer: L.layerGroup(markers),
            serviceUrlParams: {mode: $scope.mode,
                               search_radius: document.getElementById('radius').value },
            serviceUrl: serviceUrl
        }).addTo(map);

        update(true, traceCoords, $scope.mode);
    };

    var mapMatchingGeoJSONControl;

    var mapMatchGeoJSON = function (traceGeoJSON) {
        var markers = {
            'type': 'MultiPoint',
            'coordinates': traceGeoJSON.coordinates || (traceGeoJSON.geometry && traceGeoJSON.geometry.coordinates)
        };

        if (mapMatchingGeoJSONControl) {
            mapMatchingGeoJSONControl.removeFrom(map);
        }
        mapMatchingGeoJSONControl = L.mapMatching(traceGeoJSON, {
            serviceUrlParams: {mode: $scope.mode,
                               search_radius: document.getElementById('radius').value },
            serviceUrl: serviceUrl
        }).addTo(map);

        update(true, traceGeoJSON, $scope.mode);
    };

    var baseMaps = {
        "Road" : road,
        "Zinc" : zinc,
        "Cycle" : cycle,
        "Elevation" : elevation
    };

    //leaflet slippy map
    var map = L.map('map', {
        zoom : $rootScope.geobase.zoom,
        zoomControl : true,
        layers : [ road ],
        center : [ $rootScope.geobase.lat, $rootScope.geobase.lon ]
    });

    // var sequence = new Sequence(map);

    // If iframed, we're going to have to disable some of the touch interaction
    // to not hijack page scroll. See Stamen's Checklist for Maps: http://content.stamen.com/stamens-checklist-for-maps
    if (window.self !== window.top) {
        map.scrollWheelZoom.disable();
    }

    // Add geocoding plugin
    var options = {
        layers: 'coarse'
    };

    L.control.geocoder('search-8LtGSDw', options).addTo(map);
    L.control.layers(baseMaps, null).addTo(map);

    // If iframed, we're going to have to disable some of the touch interaction
    // to not hijack page scroll. See Stamen's Checklist for Maps: http://content.stamen.com/stamens-checklist-for-maps
    if (window.self !== window.top) {
        map.scrollWheelZoom.disable();
    }

    var getOriginIcon = function() {
        return new L.Icon({
            iconUrl : '../matrix/resource/matrix_pin_start.png',
            iconSize : [ 30, 36 ],
            shadowUrl: null
        });
    };

    var getDestinationIcon = function() {
        return new L.Icon({
            iconUrl : '../matrix/resource/matrix_pin_end.png',
            iconSize : [ 30, 36 ],
            shadowUrl: null
        });
    };

    //Number of locations
    var hash = new L.Hash(map);
    var markers = [];
    var remove_markers = function() {
        for (var i = 0; i < markers.length; i++) {
            map.removeLayer(markers[i]);
        }
        markers = [];
    };


    var parseHash = function() {
        var hash = window.location.hash;
        if (hash.indexOf('#') === 0)
            hash = hash.substr(1);
        return hash.split('&');
    };

    var parseParams = function(pieces) {
        var parameters = {};
        pieces.forEach(function(e, i, a) {
            var parts = e.split('=');
            if (parts.length < 2)
                parts.push('');
            parameters[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
        });
        return parameters;
    };

    var update = function(show, coords, costing) {
        // update the permalink hash
        var pieces = parseHash();
        var extra = '';
        pieces.forEach(function(e, i, a) {
            if (e.length && e.slice(0, 'locations='.length) != 'locations=' && e.slice(0, 'costing='.length) != 'costing=' && e.slice(0, 'directions_options='.length) != 'directions_options=')
                extra = extra + (extra.length ? '&' : '') + e;
        });
        var parameter = '&costing=' + JSON.stringify(costing);
        window.location.hash = '#' + extra + parameter;
        document.getElementById('permalink').innerHTML = "<a href='http://valhalla.github.io/demos/map_matching/index.html" + window.location.hash + "' target='_top'>Map Matching Permalink</a>";
    };

    var hashRoute = function() {
        document.getElementById('permalink').innerHTML = "<a href='http://valhalla.github.io/demos/map_matching/index.html" + window.location.hash + "' target='_top'>Map Matching Permalink</a>";
    };

    $rootScope.$on('map.setView', function(ev, geo, zoom) {
        map.setView(geo, zoom || 8);
    });

    $rootScope.$on('map.dropDestMarker', function(ev, geo, locCount) {
        var marker = new L.marker(geo, {
            icon : getDestinationIcon(),
            draggable:true
        }).bindLabel((locCount).toString(), (locCount < 10) ? {
            position: [geo.lat,geo.lon],
            noHide: true,
            offset: [-9,-12]
        } : {
            position: [geo.lat,geo.lon],
            noHide: true,
            offset: [-13,-12]
        });
        map.addLayer(marker);
        markers.push(marker);
        marker.on('dragend', function(event){
            var marker = event.target;
            var position = marker.getLatLng();
            marker.setLatLng(position,{draggable:'true'}).bindPopup(position);
            var latlon = position.lat.toFixed(6) + ' , '+ position.lng.toFixed(6);
            var latLngIndex = parseInt(marker.label._content);
            $scope.endPoints.splice(latLngIndex-1,1,{index: (latLngIndex), lat:position.lat, lon: position.lng,latlon: latlon});
            $scope.$apply();
            mapMatch();
            return;
        });
    });

    $scope.renderHtml = function(html_code) {
        return $sce.trustAsHtml(html_code);
    };

    $scope.setMode = function(mode) {
        $scope.mode = mode;
        mapMatch();
    };

    // show something to start with but only if it was requested
    $(window).load(function(e) {
        hashRoute();
    });

    var reset_form = function() {
        $scope.endPoints = [];
    };

    //set up map events
    var counterText = 1;
    map.on('click', function(e) {
        if (!markers.length) {
            $scope.manyToManyClick(e);
        }

        var geo = {
            'lat' : e.latlng.lat.toFixed(6),
            'lon' : e.latlng.lng.toFixed(6)
        };

        $rootScope.$emit('map.dropDestMarker', [ geo.lat, geo.lon ], counterText);
        var latlon = geo.lat + ' , '+ geo.lon;
        $scope.endPoints.push({
            index: (counterText),
            lat: geo.lat,
            lon: geo.lon,
            latlon: latlon
        });
        $scope.$apply();
        counterText++;

        mapMatch();
    });

    var traceLayer;
    $('#geojson_match').click(function () {
        $scope.clearAll();
        var geojson = JSON.parse($('#geojson').val());
        if (traceLayer) {
            map.removeLayer(traceLayer);
        }
        traceLayer = L.geoJson(geojson, {
            style: {
                color: '#ff7800'
            }
        }).addTo(map);
        map.fitBounds(traceLayer.getBounds());
        mapMatchGeoJSON(geojson);
    });

    var clearBtn = document.getElementById("clear_btn");

    $scope.mode = 'auto';
    $scope.endPoints = [];
    $scope.editingFocus = 'start_points';
    $scope.appView = 'control';

    $scope.backToControlView = function(e) {
        $scope.appView = 'control';
    };

    $scope.clearRouteShape = function(e) {
    };

    $scope.clearAll = function(e) {
        $scope.endPoints = [];
        $scope.appView = 'control';
        $scope.editingFocus = 'start_points';
        sentManyToManyEnd = false;
        counterText = 1;

        if (mapMatchingControl) {
            mapMatchingControl.removeFrom(map);
        }
        mapMatchingControl = null;

        markers.forEach(function (marker) {
            map.removeLayer(marker);
        });

        markers = [];
        window.location.hash = "";
    };

    $scope.goToEndPoints = function(e) {
        $scope.editingFocus = 'end_points';
    };

    $scope.manyToManyClick = function(e) {
        reset_form();
        $scope.start_mapInstruction = " Click on the map to add a point";
        $scope.end_mapInstruction = " Click on the map to add points";
        $scope.startgeocode = "lat, long";
        $scope.endgeocode = "lat, long";
        getEnvToken();
    };

});
