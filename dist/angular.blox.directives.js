require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

require('templates');

var app = angular.module('BuildingBlox.Directives', ['BuildingBlox.Directives.Templates', require('./helpers')])
    .provider('AngularBloxDirectives', function () {
        'use strict';
        var baseOptions = {
                backbone: false
            },
            getValue = function (options, name) {
                return options[name] !== undefined ? options[name] : baseOptions[name];
            };

        function AngularBloxDirectivesOptions(options) {
            this.backbone = options.backbone;
        }

        this.init = function (options) {
            baseOptions.backbone = getValue(options, 'backbone');
        };

        this.$get = [function () {
            return new AngularBloxDirectivesOptions(baseOptions);
        }];
    });

var exports = app;
module.exports = app;

require('./directives/dragArea.js');
require('./directives/draggable.js');
require('./directives/draggableList.js');
require('./directives/droparea.js');
require('./directives/hiddenInput.js');
require('./directives/listItem.js');
},{"./directives/dragArea.js":2,"./directives/draggable.js":3,"./directives/draggableList.js":4,"./directives/droparea.js":5,"./directives/hiddenInput.js":6,"./directives/listItem.js":7,"./helpers":11,"templates":"OSVe9F"}],2:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

var interact = window.interact;
var app = require('../angular.blox.directives.js');
app.directive('dragArea', [function () {
    'use strict';
    return {
        restrict: 'C',
        scope: {
            remove: '='
        },
        controller: ['$scope', function ($scope) {
            this.remove = $scope.remove;
        }]
    };
}]);
},{"../angular.blox.directives.js":1}],3:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

var interact = window.interact;
var app = require('../angular.blox.directives.js');
app.directive('draggable', [function () {
    'use strict';
    return {
        restrict: 'C',
        require: '^dragArea',
        link: function (scope, element, attrs, dragAreaController) {
            var htmlElement = element[0],
                interactible;
            interactible = interact(htmlElement);
            interactible.draggable({
                onmove: function (event) {
                    var target = event.target,
                        x = (parseInt(target.getAttribute('data-x'), 10) || 0) + event.dx,
                        y = (parseInt(target.getAttribute('data-y'), 10) || 0) + event.dy;
                    element.css({
                        'transition': '',
                        'z-index': 1000,
                        'transform': 'translate(' + x + 'px, ' + y + 'px)'
                    });
                    element.attr('data-x', x);
                    element.attr('data-y', y);
                    element.addClass('transparent');
                },
                onend: function () {
                    element.css({
                        'z-index': 0,
                        'transform': ''
                    });
                    element.attr('data-x', 0);
                    element.attr('data-y', 0);
                    element.removeClass('transparent');
                }
            });
            interactible.getItem = function () {
                if (scope.item && scope.getIdProperty) {
                    return scope.item;
                }
                return null;
            };
            interactible.remove = function () {
                if (scope.item && scope.getIdProperty && dragAreaController.remove) {
                    dragAreaController.remove(scope.item[scope.getIdProperty()]);
                }
            };
        }
    };
}]);
},{"../angular.blox.directives.js":1}],4:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

var app = require('../angular.blox.directives.js');
app.directive('draggableList', ['abbGenerators', 'abbArrayHelpers', function (generators, arrayHelpers) {
    'use strict';
    return {
        restrict: 'E',
        templateUrl: 'src/templates/draggableList.html',
        scope: {
            model: '=ngModel',
            displayProperty: '@',
            idProperty: '@',
            listNameProperty: '@',
            listProperty: '@'
        },
        controller: ['$scope', function ($scope) {
            var getIdProperty = function () { return $scope.idProperty || '_id'; },
                getDisplayProperty = function () { return $scope.displayProperty || 'value'; },
                getListNameProperty = function () { return $scope.listNameProperty || 'name'; },
                getListProperty = function () { return $scope.listProperty || 'list'; },
                getList = function () { return $scope.model[getListProperty()]; },
                getIndexOfId = function (id, defaultValue) {
                    return arrayHelpers.firstReturn(getList(), function (item, index) {
                        if (item[getIdProperty()] === id) {
                            return index;
                        }
                    }, defaultValue);
                },
                addBeforeList = {},
                newItem;

            $scope.getIdProperty = getIdProperty;
            $scope.getDisplayProperty = getDisplayProperty;
            $scope.getListNameProperty = getListNameProperty;
            $scope.getList = getList;
            $scope.addToList = function (ev) {
                newItem = ev.draggable.getItem();
                if (getList().indexOf(newItem) >= 0) {
                    return;
                }
                ev.draggable.remove();
                if (newItem) {
                    getList().push(newItem);
                }
                addBeforeList = {};
            };
            if (!$scope.model) {
                return;
            }
            arrayHelpers.each(getList(), function (item, index) {
                if (typeof item !== 'object') {
                    newItem = {};
                    newItem[getDisplayProperty()] = item;
                    item = newItem;
                    getList().splice(index, 1, item);
                }
                item[getIdProperty()] = item[getIdProperty()] || generators.guid();
            });
            $scope.model[getListNameProperty()] = $scope.model[getListNameProperty()] || 'Untitled';

            $scope.removeById = function (id) {
                var defaultValue = -1,
                    removeIndex;
                removeIndex = getIndexOfId(id, defaultValue);
                if (removeIndex !== defaultValue) {
                    if (getList().splice) {
                        getList().splice(removeIndex, 1);
                    } else {
                        delete getList()[removeIndex];
                    }
                }
                addBeforeList = {};
            };

            $scope.createAddBefore = function (id) {
                var defaultValue = -1,
                    idIndex;
                if (!addBeforeList['_id_' + id]) {
                    idIndex = getIndexOfId(id, defaultValue);
                    addBeforeList['_id_' + id] = function (ev) {
                        newItem = ev.draggable.getItem();
                        ev.draggable.remove();
                        getList().splice(idIndex, 0, newItem);
                        addBeforeList = {};
                    };
                }
                return addBeforeList['_id_' + id];
            };
        }]
    };
}]);
},{"../angular.blox.directives.js":1}],5:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

var interact = window.interact;
var app = require('../angular.blox.directives.js');
app.directive('dropArea', [function () {
    'use strict';
    return {
        restrict: 'C',
        scope: {
            onDrop: '=',
            onDragEnter: '=',
            onDragLeave: '='
        },
        link: function (scope, element) {
            var htmlElement = element[0],
                interactible;
            interactible = interact(htmlElement);
            interactible.dropzone({
                accepts: '.draggable',
                dragenter: function () {
                    if (!scope.onDragEnter) {
                        return;
                    }
                    var args = arguments;
                    scope.$apply(function () {
                        scope.onDragEnter.apply(scope, args);
                    });
                },
                dragleave: function () {
                    if (!scope.onDragLeave) {
                        return;
                    }
                    var args = arguments;
                    scope.$apply(function () {
                        scope.onDragLeave.apply(scope, args);
                    });
                },
                drop:  function () {
                    if (!scope.onDrop) {
                        return;
                    }
                    var args = arguments;
                    scope.$apply(function () {
                        scope.onDrop.apply(scope, args);
                    });
                }
            });
        }
    };
}]);
},{"../angular.blox.directives.js":1}],6:[function(require,module,exports){
/*global angular, require, module, interact*/
/*jslint browser: true*/

var app = require('../angular.blox.directives.js');
app.directive('hiddenInput', ['abbArrayHelpers', function (arrayHelpers) {
    'use strict';
    return {
        restrict: 'E',
        template: '<input />',
        replace: true,
        scope: {
        },
        link: function (scope, element) {
            var inputElement = element.find('input'),
                parentAttributes = element[0].attributes;

            arrayHelpers.each(parentAttributes, function (attributeNode) {
                if (attributeNode.value) {
                    inputElement.attr(attributeNode.nodeName, attributeNode.value);
                }
            });

            inputElement.addClass('hiddenInput');
        }
    };
}]);
},{"../angular.blox.directives.js":1}],7:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

var app = require('../angular.blox.directives.js');
app.directive('listItem', [function () {
    'use strict';
    return {
        restrict: 'E',
        templateUrl: 'src/templates/listItem.html',
        scope: {
            model: '=ngModel',
            displayProperty: '@'
        },
        controller: ['$scope', '$element', function ($scope, $element) {
            $scope.getValue = function () { return $scope.model[$scope.displayProperty || 'value']; };
        }]
    };
}]);
},{"../angular.blox.directives.js":1}],8:[function(require,module,exports){
module.exports=require(1)
},{"./directives/dragArea.js":2,"./directives/draggable.js":3,"./directives/draggableList.js":4,"./directives/droparea.js":5,"./directives/hiddenInput.js":6,"./directives/listItem.js":7,"./helpers":11,"templates":"OSVe9F"}],9:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

var defaultReturnValue = -Infinity;

function arrayCallHelper(func, arr, i, obj) {
    'use strict';
    obj = obj || arr[i];
    return func.call(obj, obj, i, arr);
}

function getDefaultValue(defaultValue) {
    'use strict';
    return defaultValue === undefined ? defaultReturnValue : defaultValue;
}

/* -------------------------------------------------------------------- */

function each(arr, func) {
    'use strict';
    var i;
    for (i in arr) {
        if (arr.hasOwnProperty(i)) {
            arrayCallHelper(func, arr, i);
        }
    }
}

function firstReturn(arr, func) {
    'use strict';
    var i, val;
    for (i in arr) {
        if (arr.hasOwnProperty(i)) {
            val = arrayCallHelper(func, arr, i);
            if (val !== undefined) {
                return val;
            }
        }
    }
}

function all(arr, func) {
    'use strict';
    var val;
    val = firstReturn(arr, function (obj, i) {
        val = arrayCallHelper(func, arr, i);
        if (!val) {
            return false;
        }
    });

    return val || false;
}

function any(arr, func) {
    'use strict';
    var val;
    val = firstReturn(arr, function (obj, i) {
        val = arrayCallHelper(func, arr, i);
        if (val) {
            return true;
        }
    });

    return val || false;
}

function where(arr, func) {
    'use strict';
    var out = [];
    each(arr, function (obj, i) {
        if (arrayCallHelper(func, arr, i)) {
            out.push(obj);
        }
    });
    return out;
}

function single(arr, func, defaultValue) {
    'use strict';
    var out, outIsSet;
    defaultValue = getDefaultValue(defaultValue);
    if (typeof func === "function") {
        out = defaultValue;
        outIsSet = true;
        each(arr, function (obj, i) {
            if (arrayCallHelper(func, arr, i)) {
                if (outIsSet) {
                    return defaultValue;
                }
                outIsSet = true;
                out = obj;
            }
        });
        return out;
    }

    if (arr.length !== 1) {
        return getDefaultValue(defaultValue);
    }
    return arr[0];
}

function first(arr, func, defaultValue) {
    'use strict';

    if (arr.length < 1) {
        return getDefaultValue(defaultValue);
    }

    if (typeof func === "function") {
        each(arr, function (obj, i) {
            if (arrayCallHelper(func, arr, i)) {
                return obj;
            }
        });
        return getDefaultValue(defaultValue);
    }

    return arr[0];
}

var arrayHelpers = {
    each: each,
    firstReturn: firstReturn,
    all: all,
    any: any,
    where: where,
    single: single,
    first: first
};

Object.freeze(arrayHelpers);

module.exports = arrayHelpers;
},{}],10:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

function randHex() {
    'use strict';
    var rand = Math.random();
    rand = parseInt(rand * 16, 10);
    return rand.toString(16);
}

function guid() {
    'use strict';
    var i,
        output = '';

    for (i = 0; i < 8; i++) {
        output += randHex();
    }
    output += '-';
    for (i = 0; i < 4; i++) {
        output += randHex();
    }
    output += '-4';
    for (i = 0; i < 3; i++) {
        output += randHex();
    }
    output += '-';
    for (i = 0; i < 4; i++) {
        output += randHex();
    }
    output += '-';
    for (i = 0; i < 12; i++) {
        output += randHex();
    }

    return output;
}

var generators = {
    randHex: randHex,
    guid: guid
};

Object.freeze(generators);

module.exports = generators;
},{}],11:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

var moduleName = 'ABB.Helpers';

var app = angular.module(moduleName, []);

app.value('abbArrayHelpers', require('./arrayHelpers.js'));
app.value('abbGenerators', require('./generators.js'));

module.exports = moduleName;
},{"./arrayHelpers.js":9,"./generators.js":10}],"templates":[function(require,module,exports){
module.exports=require('OSVe9F');
},{}],"OSVe9F":[function(require,module,exports){
(function (global){
(function browserifyShim(module, define) {
(function(module) {
try { module = angular.module("BuildingBlox.Directives.Templates"); }
catch(err) { module = angular.module("BuildingBlox.Directives.Templates", []); }
module.run(["$templateCache", function($templateCache) {
  $templateCache.put("src/templates/draggableList.html",
    "<div class=\"dragArea\" remove=\"removeById\">\n" +
    "    <div class=\"panel panel-primary dropArea\" on-drop=\"addToList\">\n" +
    "        <div class=\"panel-heading\"><input class=\"hidden-input\" ng-model=\"model[getListNameProperty()]\" /></div>\n" +
    "        <div class=\"list-group-item dropArea draggable\" on-drop=\"createAddBefore(item[getIdProperty()])\" ng-repeat=\"(index, item) in getList() track by item[getIdProperty()]\" ng-if=\"index != getListNameProperty()\">\n" +
    "            <list-item ng-model=\"item\" display-property=\"{{getDisplayProperty()}}\"></list-item>\n" +
    "        </div>\n" +
    "    </div>\n" +
    "</div>");
}]);
})();

(function(module) {
try { module = angular.module("BuildingBlox.Directives.Templates"); }
catch(err) { module = angular.module("BuildingBlox.Directives.Templates", []); }
module.run(["$templateCache", function($templateCache) {
  $templateCache.put("src/templates/listItem.html",
    "<div>{{getValue()}}</div>");
}]);
})();

}).call(global, module, undefined);

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}]},{},[8])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFxEZXZcXEJ1aWxkaW5nQmxveFxcbm9kZV9tb2R1bGVzXFxndWxwLWJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxicm93c2VyLXBhY2tcXF9wcmVsdWRlLmpzIiwiQzovRGV2L0J1aWxkaW5nQmxveC9zcmMvYW5ndWxhci5ibG94LmRpcmVjdGl2ZXMuanMiLCJDOi9EZXYvQnVpbGRpbmdCbG94L3NyYy9kaXJlY3RpdmVzL2RyYWdBcmVhLmpzIiwiQzovRGV2L0J1aWxkaW5nQmxveC9zcmMvZGlyZWN0aXZlcy9kcmFnZ2FibGUuanMiLCJDOi9EZXYvQnVpbGRpbmdCbG94L3NyYy9kaXJlY3RpdmVzL2RyYWdnYWJsZUxpc3QuanMiLCJDOi9EZXYvQnVpbGRpbmdCbG94L3NyYy9kaXJlY3RpdmVzL2Ryb3BhcmVhLmpzIiwiQzovRGV2L0J1aWxkaW5nQmxveC9zcmMvZGlyZWN0aXZlcy9oaWRkZW5JbnB1dC5qcyIsIkM6L0Rldi9CdWlsZGluZ0Jsb3gvc3JjL2RpcmVjdGl2ZXMvbGlzdEl0ZW0uanMiLCJDOi9EZXYvQnVpbGRpbmdCbG94L3NyYy9oZWxwZXJzL2FycmF5SGVscGVycy5qcyIsIkM6L0Rldi9CdWlsZGluZ0Jsb3gvc3JjL2hlbHBlcnMvZ2VuZXJhdG9ycy5qcyIsIkM6L0Rldi9CdWlsZGluZ0Jsb3gvc3JjL2hlbHBlcnMvaW5kZXguanMiLCJDOi9EZXYvQnVpbGRpbmdCbG94L3NyYy90bXAvdGVtcGxhdGVzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qZ2xvYmFsIGFuZ3VsYXIsIHJlcXVpcmUsIG1vZHVsZSovXHJcbi8qanNsaW50IGJyb3dzZXI6IHRydWUqL1xyXG5cclxucmVxdWlyZSgndGVtcGxhdGVzJyk7XHJcblxyXG52YXIgYXBwID0gYW5ndWxhci5tb2R1bGUoJ0J1aWxkaW5nQmxveC5EaXJlY3RpdmVzJywgWydCdWlsZGluZ0Jsb3guRGlyZWN0aXZlcy5UZW1wbGF0ZXMnLCByZXF1aXJlKCcuL2hlbHBlcnMnKV0pXHJcbiAgICAucHJvdmlkZXIoJ0FuZ3VsYXJCbG94RGlyZWN0aXZlcycsIGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAndXNlIHN0cmljdCc7XHJcbiAgICAgICAgdmFyIGJhc2VPcHRpb25zID0ge1xyXG4gICAgICAgICAgICAgICAgYmFja2JvbmU6IGZhbHNlXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGdldFZhbHVlID0gZnVuY3Rpb24gKG9wdGlvbnMsIG5hbWUpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBvcHRpb25zW25hbWVdICE9PSB1bmRlZmluZWQgPyBvcHRpb25zW25hbWVdIDogYmFzZU9wdGlvbnNbbmFtZV07XHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgIGZ1bmN0aW9uIEFuZ3VsYXJCbG94RGlyZWN0aXZlc09wdGlvbnMob3B0aW9ucykge1xyXG4gICAgICAgICAgICB0aGlzLmJhY2tib25lID0gb3B0aW9ucy5iYWNrYm9uZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuaW5pdCA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIGJhc2VPcHRpb25zLmJhY2tib25lID0gZ2V0VmFsdWUob3B0aW9ucywgJ2JhY2tib25lJyk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy4kZ2V0ID0gW2Z1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBBbmd1bGFyQmxveERpcmVjdGl2ZXNPcHRpb25zKGJhc2VPcHRpb25zKTtcclxuICAgICAgICB9XTtcclxuICAgIH0pO1xyXG5cclxudmFyIGV4cG9ydHMgPSBhcHA7XHJcbm1vZHVsZS5leHBvcnRzID0gYXBwO1xyXG5cclxucmVxdWlyZSgnLi9kaXJlY3RpdmVzL2RyYWdBcmVhLmpzJyk7XHJcbnJlcXVpcmUoJy4vZGlyZWN0aXZlcy9kcmFnZ2FibGUuanMnKTtcclxucmVxdWlyZSgnLi9kaXJlY3RpdmVzL2RyYWdnYWJsZUxpc3QuanMnKTtcclxucmVxdWlyZSgnLi9kaXJlY3RpdmVzL2Ryb3BhcmVhLmpzJyk7XHJcbnJlcXVpcmUoJy4vZGlyZWN0aXZlcy9oaWRkZW5JbnB1dC5qcycpO1xyXG5yZXF1aXJlKCcuL2RpcmVjdGl2ZXMvbGlzdEl0ZW0uanMnKTsiLCIvKmdsb2JhbCBhbmd1bGFyLCByZXF1aXJlLCBtb2R1bGUqL1xyXG4vKmpzbGludCBicm93c2VyOiB0cnVlKi9cclxuXHJcbnZhciBpbnRlcmFjdCA9IHdpbmRvdy5pbnRlcmFjdDtcclxudmFyIGFwcCA9IHJlcXVpcmUoJy4uL2FuZ3VsYXIuYmxveC5kaXJlY3RpdmVzLmpzJyk7XHJcbmFwcC5kaXJlY3RpdmUoJ2RyYWdBcmVhJywgW2Z1bmN0aW9uICgpIHtcclxuICAgICd1c2Ugc3RyaWN0JztcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgcmVzdHJpY3Q6ICdDJyxcclxuICAgICAgICBzY29wZToge1xyXG4gICAgICAgICAgICByZW1vdmU6ICc9J1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgY29udHJvbGxlcjogWyckc2NvcGUnLCBmdW5jdGlvbiAoJHNjb3BlKSB7XHJcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlID0gJHNjb3BlLnJlbW92ZTtcclxuICAgICAgICB9XVxyXG4gICAgfTtcclxufV0pOyIsIi8qZ2xvYmFsIGFuZ3VsYXIsIHJlcXVpcmUsIG1vZHVsZSovXHJcbi8qanNsaW50IGJyb3dzZXI6IHRydWUqL1xyXG5cclxudmFyIGludGVyYWN0ID0gd2luZG93LmludGVyYWN0O1xyXG52YXIgYXBwID0gcmVxdWlyZSgnLi4vYW5ndWxhci5ibG94LmRpcmVjdGl2ZXMuanMnKTtcclxuYXBwLmRpcmVjdGl2ZSgnZHJhZ2dhYmxlJywgW2Z1bmN0aW9uICgpIHtcclxuICAgICd1c2Ugc3RyaWN0JztcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgcmVzdHJpY3Q6ICdDJyxcclxuICAgICAgICByZXF1aXJlOiAnXmRyYWdBcmVhJyxcclxuICAgICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzLCBkcmFnQXJlYUNvbnRyb2xsZXIpIHtcclxuICAgICAgICAgICAgdmFyIGh0bWxFbGVtZW50ID0gZWxlbWVudFswXSxcclxuICAgICAgICAgICAgICAgIGludGVyYWN0aWJsZTtcclxuICAgICAgICAgICAgaW50ZXJhY3RpYmxlID0gaW50ZXJhY3QoaHRtbEVsZW1lbnQpO1xyXG4gICAgICAgICAgICBpbnRlcmFjdGlibGUuZHJhZ2dhYmxlKHtcclxuICAgICAgICAgICAgICAgIG9ubW92ZTogZnVuY3Rpb24gKGV2ZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRhcmdldCA9IGV2ZW50LnRhcmdldCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgeCA9IChwYXJzZUludCh0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXgnKSwgMTApIHx8IDApICsgZXZlbnQuZHgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHkgPSAocGFyc2VJbnQodGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS15JyksIDEwKSB8fCAwKSArIGV2ZW50LmR5O1xyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuY3NzKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ3RyYW5zaXRpb24nOiAnJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ3otaW5kZXgnOiAxMDAwLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAndHJhbnNmb3JtJzogJ3RyYW5zbGF0ZSgnICsgeCArICdweCwgJyArIHkgKyAncHgpJ1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuYXR0cignZGF0YS14JywgeCk7XHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5hdHRyKCdkYXRhLXknLCB5KTtcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LmFkZENsYXNzKCd0cmFuc3BhcmVudCcpO1xyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIG9uZW5kOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5jc3Moe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnei1pbmRleCc6IDAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICd0cmFuc2Zvcm0nOiAnJ1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuYXR0cignZGF0YS14JywgMCk7XHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5hdHRyKCdkYXRhLXknLCAwKTtcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnJlbW92ZUNsYXNzKCd0cmFuc3BhcmVudCcpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgaW50ZXJhY3RpYmxlLmdldEl0ZW0gPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoc2NvcGUuaXRlbSAmJiBzY29wZS5nZXRJZFByb3BlcnR5KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLml0ZW07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW50ZXJhY3RpYmxlLnJlbW92ZSA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIGlmIChzY29wZS5pdGVtICYmIHNjb3BlLmdldElkUHJvcGVydHkgJiYgZHJhZ0FyZWFDb250cm9sbGVyLnJlbW92ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGRyYWdBcmVhQ29udHJvbGxlci5yZW1vdmUoc2NvcGUuaXRlbVtzY29wZS5nZXRJZFByb3BlcnR5KCldKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG59XSk7IiwiLypnbG9iYWwgYW5ndWxhciwgcmVxdWlyZSwgbW9kdWxlKi9cclxuLypqc2xpbnQgYnJvd3NlcjogdHJ1ZSovXHJcblxyXG52YXIgYXBwID0gcmVxdWlyZSgnLi4vYW5ndWxhci5ibG94LmRpcmVjdGl2ZXMuanMnKTtcclxuYXBwLmRpcmVjdGl2ZSgnZHJhZ2dhYmxlTGlzdCcsIFsnYWJiR2VuZXJhdG9ycycsICdhYmJBcnJheUhlbHBlcnMnLCBmdW5jdGlvbiAoZ2VuZXJhdG9ycywgYXJyYXlIZWxwZXJzKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHJlc3RyaWN0OiAnRScsXHJcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdzcmMvdGVtcGxhdGVzL2RyYWdnYWJsZUxpc3QuaHRtbCcsXHJcbiAgICAgICAgc2NvcGU6IHtcclxuICAgICAgICAgICAgbW9kZWw6ICc9bmdNb2RlbCcsXHJcbiAgICAgICAgICAgIGRpc3BsYXlQcm9wZXJ0eTogJ0AnLFxyXG4gICAgICAgICAgICBpZFByb3BlcnR5OiAnQCcsXHJcbiAgICAgICAgICAgIGxpc3ROYW1lUHJvcGVydHk6ICdAJyxcclxuICAgICAgICAgICAgbGlzdFByb3BlcnR5OiAnQCdcclxuICAgICAgICB9LFxyXG4gICAgICAgIGNvbnRyb2xsZXI6IFsnJHNjb3BlJywgZnVuY3Rpb24gKCRzY29wZSkge1xyXG4gICAgICAgICAgICB2YXIgZ2V0SWRQcm9wZXJ0eSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICRzY29wZS5pZFByb3BlcnR5IHx8ICdfaWQnOyB9LFxyXG4gICAgICAgICAgICAgICAgZ2V0RGlzcGxheVByb3BlcnR5ID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJHNjb3BlLmRpc3BsYXlQcm9wZXJ0eSB8fCAndmFsdWUnOyB9LFxyXG4gICAgICAgICAgICAgICAgZ2V0TGlzdE5hbWVQcm9wZXJ0eSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICRzY29wZS5saXN0TmFtZVByb3BlcnR5IHx8ICduYW1lJzsgfSxcclxuICAgICAgICAgICAgICAgIGdldExpc3RQcm9wZXJ0eSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICRzY29wZS5saXN0UHJvcGVydHkgfHwgJ2xpc3QnOyB9LFxyXG4gICAgICAgICAgICAgICAgZ2V0TGlzdCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICRzY29wZS5tb2RlbFtnZXRMaXN0UHJvcGVydHkoKV07IH0sXHJcbiAgICAgICAgICAgICAgICBnZXRJbmRleE9mSWQgPSBmdW5jdGlvbiAoaWQsIGRlZmF1bHRWYWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhcnJheUhlbHBlcnMuZmlyc3RSZXR1cm4oZ2V0TGlzdCgpLCBmdW5jdGlvbiAoaXRlbSwgaW5kZXgpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGl0ZW1bZ2V0SWRQcm9wZXJ0eSgpXSA9PT0gaWQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBpbmRleDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0sIGRlZmF1bHRWYWx1ZSk7XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgYWRkQmVmb3JlTGlzdCA9IHt9LFxyXG4gICAgICAgICAgICAgICAgbmV3SXRlbTtcclxuXHJcbiAgICAgICAgICAgICRzY29wZS5nZXRJZFByb3BlcnR5ID0gZ2V0SWRQcm9wZXJ0eTtcclxuICAgICAgICAgICAgJHNjb3BlLmdldERpc3BsYXlQcm9wZXJ0eSA9IGdldERpc3BsYXlQcm9wZXJ0eTtcclxuICAgICAgICAgICAgJHNjb3BlLmdldExpc3ROYW1lUHJvcGVydHkgPSBnZXRMaXN0TmFtZVByb3BlcnR5O1xyXG4gICAgICAgICAgICAkc2NvcGUuZ2V0TGlzdCA9IGdldExpc3Q7XHJcbiAgICAgICAgICAgICRzY29wZS5hZGRUb0xpc3QgPSBmdW5jdGlvbiAoZXYpIHtcclxuICAgICAgICAgICAgICAgIG5ld0l0ZW0gPSBldi5kcmFnZ2FibGUuZ2V0SXRlbSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGdldExpc3QoKS5pbmRleE9mKG5ld0l0ZW0pID49IDApIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBldi5kcmFnZ2FibGUucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAobmV3SXRlbSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGdldExpc3QoKS5wdXNoKG5ld0l0ZW0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYWRkQmVmb3JlTGlzdCA9IHt9O1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBpZiAoISRzY29wZS5tb2RlbCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGFycmF5SGVscGVycy5lYWNoKGdldExpc3QoKSwgZnVuY3Rpb24gKGl0ZW0sIGluZGV4KSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGl0ZW0gIT09ICdvYmplY3QnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmV3SXRlbSA9IHt9O1xyXG4gICAgICAgICAgICAgICAgICAgIG5ld0l0ZW1bZ2V0RGlzcGxheVByb3BlcnR5KCldID0gaXRlbTtcclxuICAgICAgICAgICAgICAgICAgICBpdGVtID0gbmV3SXRlbTtcclxuICAgICAgICAgICAgICAgICAgICBnZXRMaXN0KCkuc3BsaWNlKGluZGV4LCAxLCBpdGVtKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGl0ZW1bZ2V0SWRQcm9wZXJ0eSgpXSA9IGl0ZW1bZ2V0SWRQcm9wZXJ0eSgpXSB8fCBnZW5lcmF0b3JzLmd1aWQoKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICRzY29wZS5tb2RlbFtnZXRMaXN0TmFtZVByb3BlcnR5KCldID0gJHNjb3BlLm1vZGVsW2dldExpc3ROYW1lUHJvcGVydHkoKV0gfHwgJ1VudGl0bGVkJztcclxuXHJcbiAgICAgICAgICAgICRzY29wZS5yZW1vdmVCeUlkID0gZnVuY3Rpb24gKGlkKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgZGVmYXVsdFZhbHVlID0gLTEsXHJcbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlSW5kZXg7XHJcbiAgICAgICAgICAgICAgICByZW1vdmVJbmRleCA9IGdldEluZGV4T2ZJZChpZCwgZGVmYXVsdFZhbHVlKTtcclxuICAgICAgICAgICAgICAgIGlmIChyZW1vdmVJbmRleCAhPT0gZGVmYXVsdFZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGdldExpc3QoKS5zcGxpY2UpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZ2V0TGlzdCgpLnNwbGljZShyZW1vdmVJbmRleCwgMSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGdldExpc3QoKVtyZW1vdmVJbmRleF07XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYWRkQmVmb3JlTGlzdCA9IHt9O1xyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgJHNjb3BlLmNyZWF0ZUFkZEJlZm9yZSA9IGZ1bmN0aW9uIChpZCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGRlZmF1bHRWYWx1ZSA9IC0xLFxyXG4gICAgICAgICAgICAgICAgICAgIGlkSW5kZXg7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWFkZEJlZm9yZUxpc3RbJ19pZF8nICsgaWRdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWRJbmRleCA9IGdldEluZGV4T2ZJZChpZCwgZGVmYXVsdFZhbHVlKTtcclxuICAgICAgICAgICAgICAgICAgICBhZGRCZWZvcmVMaXN0WydfaWRfJyArIGlkXSA9IGZ1bmN0aW9uIChldikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdJdGVtID0gZXYuZHJhZ2dhYmxlLmdldEl0ZW0oKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZXYuZHJhZ2dhYmxlLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBnZXRMaXN0KCkuc3BsaWNlKGlkSW5kZXgsIDAsIG5ld0l0ZW0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhZGRCZWZvcmVMaXN0ID0ge307XHJcbiAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBhZGRCZWZvcmVMaXN0WydfaWRfJyArIGlkXTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9XVxyXG4gICAgfTtcclxufV0pOyIsIi8qZ2xvYmFsIGFuZ3VsYXIsIHJlcXVpcmUsIG1vZHVsZSovXHJcbi8qanNsaW50IGJyb3dzZXI6IHRydWUqL1xyXG5cclxudmFyIGludGVyYWN0ID0gd2luZG93LmludGVyYWN0O1xyXG52YXIgYXBwID0gcmVxdWlyZSgnLi4vYW5ndWxhci5ibG94LmRpcmVjdGl2ZXMuanMnKTtcclxuYXBwLmRpcmVjdGl2ZSgnZHJvcEFyZWEnLCBbZnVuY3Rpb24gKCkge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICByZXN0cmljdDogJ0MnLFxyXG4gICAgICAgIHNjb3BlOiB7XHJcbiAgICAgICAgICAgIG9uRHJvcDogJz0nLFxyXG4gICAgICAgICAgICBvbkRyYWdFbnRlcjogJz0nLFxyXG4gICAgICAgICAgICBvbkRyYWdMZWF2ZTogJz0nXHJcbiAgICAgICAgfSxcclxuICAgICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQpIHtcclxuICAgICAgICAgICAgdmFyIGh0bWxFbGVtZW50ID0gZWxlbWVudFswXSxcclxuICAgICAgICAgICAgICAgIGludGVyYWN0aWJsZTtcclxuICAgICAgICAgICAgaW50ZXJhY3RpYmxlID0gaW50ZXJhY3QoaHRtbEVsZW1lbnQpO1xyXG4gICAgICAgICAgICBpbnRlcmFjdGlibGUuZHJvcHpvbmUoe1xyXG4gICAgICAgICAgICAgICAgYWNjZXB0czogJy5kcmFnZ2FibGUnLFxyXG4gICAgICAgICAgICAgICAgZHJhZ2VudGVyOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzY29wZS5vbkRyYWdFbnRlcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xyXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLiRhcHBseShmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLm9uRHJhZ0VudGVyLmFwcGx5KHNjb3BlLCBhcmdzKTtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBkcmFnbGVhdmU6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXNjb3BlLm9uRHJhZ0xlYXZlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XHJcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUuJGFwcGx5KGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUub25EcmFnTGVhdmUuYXBwbHkoc2NvcGUsIGFyZ3MpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIGRyb3A6ICBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzY29wZS5vbkRyb3ApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB2YXIgYXJncyA9IGFyZ3VtZW50cztcclxuICAgICAgICAgICAgICAgICAgICBzY29wZS4kYXBwbHkoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzY29wZS5vbkRyb3AuYXBwbHkoc2NvcGUsIGFyZ3MpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG59XSk7IiwiLypnbG9iYWwgYW5ndWxhciwgcmVxdWlyZSwgbW9kdWxlLCBpbnRlcmFjdCovXHJcbi8qanNsaW50IGJyb3dzZXI6IHRydWUqL1xyXG5cclxudmFyIGFwcCA9IHJlcXVpcmUoJy4uL2FuZ3VsYXIuYmxveC5kaXJlY3RpdmVzLmpzJyk7XHJcbmFwcC5kaXJlY3RpdmUoJ2hpZGRlbklucHV0JywgWydhYmJBcnJheUhlbHBlcnMnLCBmdW5jdGlvbiAoYXJyYXlIZWxwZXJzKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHJlc3RyaWN0OiAnRScsXHJcbiAgICAgICAgdGVtcGxhdGU6ICc8aW5wdXQgLz4nLFxyXG4gICAgICAgIHJlcGxhY2U6IHRydWUsXHJcbiAgICAgICAgc2NvcGU6IHtcclxuICAgICAgICB9LFxyXG4gICAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCkge1xyXG4gICAgICAgICAgICB2YXIgaW5wdXRFbGVtZW50ID0gZWxlbWVudC5maW5kKCdpbnB1dCcpLFxyXG4gICAgICAgICAgICAgICAgcGFyZW50QXR0cmlidXRlcyA9IGVsZW1lbnRbMF0uYXR0cmlidXRlcztcclxuXHJcbiAgICAgICAgICAgIGFycmF5SGVscGVycy5lYWNoKHBhcmVudEF0dHJpYnV0ZXMsIGZ1bmN0aW9uIChhdHRyaWJ1dGVOb2RlKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoYXR0cmlidXRlTm9kZS52YWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlucHV0RWxlbWVudC5hdHRyKGF0dHJpYnV0ZU5vZGUubm9kZU5hbWUsIGF0dHJpYnV0ZU5vZGUudmFsdWUpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIGlucHV0RWxlbWVudC5hZGRDbGFzcygnaGlkZGVuSW5wdXQnKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG59XSk7IiwiLypnbG9iYWwgYW5ndWxhciwgcmVxdWlyZSwgbW9kdWxlKi9cclxuLypqc2xpbnQgYnJvd3NlcjogdHJ1ZSovXHJcblxyXG52YXIgYXBwID0gcmVxdWlyZSgnLi4vYW5ndWxhci5ibG94LmRpcmVjdGl2ZXMuanMnKTtcclxuYXBwLmRpcmVjdGl2ZSgnbGlzdEl0ZW0nLCBbZnVuY3Rpb24gKCkge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICByZXN0cmljdDogJ0UnLFxyXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnc3JjL3RlbXBsYXRlcy9saXN0SXRlbS5odG1sJyxcclxuICAgICAgICBzY29wZToge1xyXG4gICAgICAgICAgICBtb2RlbDogJz1uZ01vZGVsJyxcclxuICAgICAgICAgICAgZGlzcGxheVByb3BlcnR5OiAnQCdcclxuICAgICAgICB9LFxyXG4gICAgICAgIGNvbnRyb2xsZXI6IFsnJHNjb3BlJywgJyRlbGVtZW50JywgZnVuY3Rpb24gKCRzY29wZSwgJGVsZW1lbnQpIHtcclxuICAgICAgICAgICAgJHNjb3BlLmdldFZhbHVlID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJHNjb3BlLm1vZGVsWyRzY29wZS5kaXNwbGF5UHJvcGVydHkgfHwgJ3ZhbHVlJ107IH07XHJcbiAgICAgICAgfV1cclxuICAgIH07XHJcbn1dKTsiLCIvKmdsb2JhbCBhbmd1bGFyLCByZXF1aXJlLCBtb2R1bGUqL1xyXG4vKmpzbGludCBicm93c2VyOiB0cnVlKi9cclxuXHJcbnZhciBkZWZhdWx0UmV0dXJuVmFsdWUgPSAtSW5maW5pdHk7XHJcblxyXG5mdW5jdGlvbiBhcnJheUNhbGxIZWxwZXIoZnVuYywgYXJyLCBpLCBvYmopIHtcclxuICAgICd1c2Ugc3RyaWN0JztcclxuICAgIG9iaiA9IG9iaiB8fCBhcnJbaV07XHJcbiAgICByZXR1cm4gZnVuYy5jYWxsKG9iaiwgb2JqLCBpLCBhcnIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXREZWZhdWx0VmFsdWUoZGVmYXVsdFZhbHVlKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiAgICByZXR1cm4gZGVmYXVsdFZhbHVlID09PSB1bmRlZmluZWQgPyBkZWZhdWx0UmV0dXJuVmFsdWUgOiBkZWZhdWx0VmFsdWU7XHJcbn1cclxuXHJcbi8qIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tICovXHJcblxyXG5mdW5jdGlvbiBlYWNoKGFyciwgZnVuYykge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgdmFyIGk7XHJcbiAgICBmb3IgKGkgaW4gYXJyKSB7XHJcbiAgICAgICAgaWYgKGFyci5oYXNPd25Qcm9wZXJ0eShpKSkge1xyXG4gICAgICAgICAgICBhcnJheUNhbGxIZWxwZXIoZnVuYywgYXJyLCBpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZpcnN0UmV0dXJuKGFyciwgZnVuYykge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgdmFyIGksIHZhbDtcclxuICAgIGZvciAoaSBpbiBhcnIpIHtcclxuICAgICAgICBpZiAoYXJyLmhhc093blByb3BlcnR5KGkpKSB7XHJcbiAgICAgICAgICAgIHZhbCA9IGFycmF5Q2FsbEhlbHBlcihmdW5jLCBhcnIsIGkpO1xyXG4gICAgICAgICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB2YWw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFsbChhcnIsIGZ1bmMpIHtcclxuICAgICd1c2Ugc3RyaWN0JztcclxuICAgIHZhciB2YWw7XHJcbiAgICB2YWwgPSBmaXJzdFJldHVybihhcnIsIGZ1bmN0aW9uIChvYmosIGkpIHtcclxuICAgICAgICB2YWwgPSBhcnJheUNhbGxIZWxwZXIoZnVuYywgYXJyLCBpKTtcclxuICAgICAgICBpZiAoIXZhbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHZhbCB8fCBmYWxzZTtcclxufVxyXG5cclxuZnVuY3Rpb24gYW55KGFyciwgZnVuYykge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgdmFyIHZhbDtcclxuICAgIHZhbCA9IGZpcnN0UmV0dXJuKGFyciwgZnVuY3Rpb24gKG9iaiwgaSkge1xyXG4gICAgICAgIHZhbCA9IGFycmF5Q2FsbEhlbHBlcihmdW5jLCBhcnIsIGkpO1xyXG4gICAgICAgIGlmICh2YWwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHZhbCB8fCBmYWxzZTtcclxufVxyXG5cclxuZnVuY3Rpb24gd2hlcmUoYXJyLCBmdW5jKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiAgICB2YXIgb3V0ID0gW107XHJcbiAgICBlYWNoKGFyciwgZnVuY3Rpb24gKG9iaiwgaSkge1xyXG4gICAgICAgIGlmIChhcnJheUNhbGxIZWxwZXIoZnVuYywgYXJyLCBpKSkge1xyXG4gICAgICAgICAgICBvdXQucHVzaChvYmopO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIG91dDtcclxufVxyXG5cclxuZnVuY3Rpb24gc2luZ2xlKGFyciwgZnVuYywgZGVmYXVsdFZhbHVlKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiAgICB2YXIgb3V0LCBvdXRJc1NldDtcclxuICAgIGRlZmF1bHRWYWx1ZSA9IGdldERlZmF1bHRWYWx1ZShkZWZhdWx0VmFsdWUpO1xyXG4gICAgaWYgKHR5cGVvZiBmdW5jID09PSBcImZ1bmN0aW9uXCIpIHtcclxuICAgICAgICBvdXQgPSBkZWZhdWx0VmFsdWU7XHJcbiAgICAgICAgb3V0SXNTZXQgPSB0cnVlO1xyXG4gICAgICAgIGVhY2goYXJyLCBmdW5jdGlvbiAob2JqLCBpKSB7XHJcbiAgICAgICAgICAgIGlmIChhcnJheUNhbGxIZWxwZXIoZnVuYywgYXJyLCBpKSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKG91dElzU2V0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIG91dElzU2V0ID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIG91dCA9IG9iajtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBvdXQ7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGFyci5sZW5ndGggIT09IDEpIHtcclxuICAgICAgICByZXR1cm4gZ2V0RGVmYXVsdFZhbHVlKGRlZmF1bHRWYWx1ZSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gYXJyWzBdO1xyXG59XHJcblxyXG5mdW5jdGlvbiBmaXJzdChhcnIsIGZ1bmMsIGRlZmF1bHRWYWx1ZSkge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG5cclxuICAgIGlmIChhcnIubGVuZ3RoIDwgMSkge1xyXG4gICAgICAgIHJldHVybiBnZXREZWZhdWx0VmFsdWUoZGVmYXVsdFZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodHlwZW9mIGZ1bmMgPT09IFwiZnVuY3Rpb25cIikge1xyXG4gICAgICAgIGVhY2goYXJyLCBmdW5jdGlvbiAob2JqLCBpKSB7XHJcbiAgICAgICAgICAgIGlmIChhcnJheUNhbGxIZWxwZXIoZnVuYywgYXJyLCBpKSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG9iajtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBnZXREZWZhdWx0VmFsdWUoZGVmYXVsdFZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gYXJyWzBdO1xyXG59XHJcblxyXG52YXIgYXJyYXlIZWxwZXJzID0ge1xyXG4gICAgZWFjaDogZWFjaCxcclxuICAgIGZpcnN0UmV0dXJuOiBmaXJzdFJldHVybixcclxuICAgIGFsbDogYWxsLFxyXG4gICAgYW55OiBhbnksXHJcbiAgICB3aGVyZTogd2hlcmUsXHJcbiAgICBzaW5nbGU6IHNpbmdsZSxcclxuICAgIGZpcnN0OiBmaXJzdFxyXG59O1xyXG5cclxuT2JqZWN0LmZyZWV6ZShhcnJheUhlbHBlcnMpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBhcnJheUhlbHBlcnM7IiwiLypnbG9iYWwgYW5ndWxhciwgcmVxdWlyZSwgbW9kdWxlKi9cclxuLypqc2xpbnQgYnJvd3NlcjogdHJ1ZSovXHJcblxyXG5mdW5jdGlvbiByYW5kSGV4KCkge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgdmFyIHJhbmQgPSBNYXRoLnJhbmRvbSgpO1xyXG4gICAgcmFuZCA9IHBhcnNlSW50KHJhbmQgKiAxNiwgMTApO1xyXG4gICAgcmV0dXJuIHJhbmQudG9TdHJpbmcoMTYpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBndWlkKCkge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgdmFyIGksXHJcbiAgICAgICAgb3V0cHV0ID0gJyc7XHJcblxyXG4gICAgZm9yIChpID0gMDsgaSA8IDg7IGkrKykge1xyXG4gICAgICAgIG91dHB1dCArPSByYW5kSGV4KCk7XHJcbiAgICB9XHJcbiAgICBvdXRwdXQgKz0gJy0nO1xyXG4gICAgZm9yIChpID0gMDsgaSA8IDQ7IGkrKykge1xyXG4gICAgICAgIG91dHB1dCArPSByYW5kSGV4KCk7XHJcbiAgICB9XHJcbiAgICBvdXRwdXQgKz0gJy00JztcclxuICAgIGZvciAoaSA9IDA7IGkgPCAzOyBpKyspIHtcclxuICAgICAgICBvdXRwdXQgKz0gcmFuZEhleCgpO1xyXG4gICAgfVxyXG4gICAgb3V0cHV0ICs9ICctJztcclxuICAgIGZvciAoaSA9IDA7IGkgPCA0OyBpKyspIHtcclxuICAgICAgICBvdXRwdXQgKz0gcmFuZEhleCgpO1xyXG4gICAgfVxyXG4gICAgb3V0cHV0ICs9ICctJztcclxuICAgIGZvciAoaSA9IDA7IGkgPCAxMjsgaSsrKSB7XHJcbiAgICAgICAgb3V0cHV0ICs9IHJhbmRIZXgoKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gb3V0cHV0O1xyXG59XHJcblxyXG52YXIgZ2VuZXJhdG9ycyA9IHtcclxuICAgIHJhbmRIZXg6IHJhbmRIZXgsXHJcbiAgICBndWlkOiBndWlkXHJcbn07XHJcblxyXG5PYmplY3QuZnJlZXplKGdlbmVyYXRvcnMpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBnZW5lcmF0b3JzOyIsIi8qZ2xvYmFsIGFuZ3VsYXIsIHJlcXVpcmUsIG1vZHVsZSovXHJcbi8qanNsaW50IGJyb3dzZXI6IHRydWUqL1xyXG5cclxudmFyIG1vZHVsZU5hbWUgPSAnQUJCLkhlbHBlcnMnO1xyXG5cclxudmFyIGFwcCA9IGFuZ3VsYXIubW9kdWxlKG1vZHVsZU5hbWUsIFtdKTtcclxuXHJcbmFwcC52YWx1ZSgnYWJiQXJyYXlIZWxwZXJzJywgcmVxdWlyZSgnLi9hcnJheUhlbHBlcnMuanMnKSk7XHJcbmFwcC52YWx1ZSgnYWJiR2VuZXJhdG9ycycsIHJlcXVpcmUoJy4vZ2VuZXJhdG9ycy5qcycpKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gbW9kdWxlTmFtZTsiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4oZnVuY3Rpb24gYnJvd3NlcmlmeVNoaW0obW9kdWxlLCBkZWZpbmUpIHtcbihmdW5jdGlvbihtb2R1bGUpIHtcbnRyeSB7IG1vZHVsZSA9IGFuZ3VsYXIubW9kdWxlKFwiQnVpbGRpbmdCbG94LkRpcmVjdGl2ZXMuVGVtcGxhdGVzXCIpOyB9XG5jYXRjaChlcnIpIHsgbW9kdWxlID0gYW5ndWxhci5tb2R1bGUoXCJCdWlsZGluZ0Jsb3guRGlyZWN0aXZlcy5UZW1wbGF0ZXNcIiwgW10pOyB9XG5tb2R1bGUucnVuKFtcIiR0ZW1wbGF0ZUNhY2hlXCIsIGZ1bmN0aW9uKCR0ZW1wbGF0ZUNhY2hlKSB7XG4gICR0ZW1wbGF0ZUNhY2hlLnB1dChcInNyYy90ZW1wbGF0ZXMvZHJhZ2dhYmxlTGlzdC5odG1sXCIsXG4gICAgXCI8ZGl2IGNsYXNzPVxcXCJkcmFnQXJlYVxcXCIgcmVtb3ZlPVxcXCJyZW1vdmVCeUlkXFxcIj5cXG5cIiArXG4gICAgXCIgICAgPGRpdiBjbGFzcz1cXFwicGFuZWwgcGFuZWwtcHJpbWFyeSBkcm9wQXJlYVxcXCIgb24tZHJvcD1cXFwiYWRkVG9MaXN0XFxcIj5cXG5cIiArXG4gICAgXCIgICAgICAgIDxkaXYgY2xhc3M9XFxcInBhbmVsLWhlYWRpbmdcXFwiPjxpbnB1dCBjbGFzcz1cXFwiaGlkZGVuLWlucHV0XFxcIiBuZy1tb2RlbD1cXFwibW9kZWxbZ2V0TGlzdE5hbWVQcm9wZXJ0eSgpXVxcXCIgLz48L2Rpdj5cXG5cIiArXG4gICAgXCIgICAgICAgIDxkaXYgY2xhc3M9XFxcImxpc3QtZ3JvdXAtaXRlbSBkcm9wQXJlYSBkcmFnZ2FibGVcXFwiIG9uLWRyb3A9XFxcImNyZWF0ZUFkZEJlZm9yZShpdGVtW2dldElkUHJvcGVydHkoKV0pXFxcIiBuZy1yZXBlYXQ9XFxcIihpbmRleCwgaXRlbSkgaW4gZ2V0TGlzdCgpIHRyYWNrIGJ5IGl0ZW1bZ2V0SWRQcm9wZXJ0eSgpXVxcXCIgbmctaWY9XFxcImluZGV4ICE9IGdldExpc3ROYW1lUHJvcGVydHkoKVxcXCI+XFxuXCIgK1xuICAgIFwiICAgICAgICAgICAgPGxpc3QtaXRlbSBuZy1tb2RlbD1cXFwiaXRlbVxcXCIgZGlzcGxheS1wcm9wZXJ0eT1cXFwie3tnZXREaXNwbGF5UHJvcGVydHkoKX19XFxcIj48L2xpc3QtaXRlbT5cXG5cIiArXG4gICAgXCIgICAgICAgIDwvZGl2PlxcblwiICtcbiAgICBcIiAgICA8L2Rpdj5cXG5cIiArXG4gICAgXCI8L2Rpdj5cIik7XG59XSk7XG59KSgpO1xuXG4oZnVuY3Rpb24obW9kdWxlKSB7XG50cnkgeyBtb2R1bGUgPSBhbmd1bGFyLm1vZHVsZShcIkJ1aWxkaW5nQmxveC5EaXJlY3RpdmVzLlRlbXBsYXRlc1wiKTsgfVxuY2F0Y2goZXJyKSB7IG1vZHVsZSA9IGFuZ3VsYXIubW9kdWxlKFwiQnVpbGRpbmdCbG94LkRpcmVjdGl2ZXMuVGVtcGxhdGVzXCIsIFtdKTsgfVxubW9kdWxlLnJ1bihbXCIkdGVtcGxhdGVDYWNoZVwiLCBmdW5jdGlvbigkdGVtcGxhdGVDYWNoZSkge1xuICAkdGVtcGxhdGVDYWNoZS5wdXQoXCJzcmMvdGVtcGxhdGVzL2xpc3RJdGVtLmh0bWxcIixcbiAgICBcIjxkaXY+e3tnZXRWYWx1ZSgpfX08L2Rpdj5cIik7XG59XSk7XG59KSgpO1xuXG59KS5jYWxsKGdsb2JhbCwgbW9kdWxlLCB1bmRlZmluZWQpO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSJdfQ==
