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
                newItem,
                getIndexOfId = function (id, defaultValue) {
                    return arrayHelpers.firstReturn(getList(), function (item, index) {
                        if (item[getIdProperty()] === id) {
                            return index;
                        }
                    }, defaultValue);
                },
                addBeforeList;

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

            addBeforeList = {};

            $scope.createAddBefore = function (id) {
                var defaultValue = -1,
                    idIndex;
                if (!addBeforeList['_id_' + id]) {
                    idIndex = getIndexOfId(id, defaultValue);
                    addBeforeList['_id_' + id] = function (ev) {
                        var item = ev.draggable.getItem();
                        ev.draggable.remove();
                        getList().splice(idIndex, 0, item);
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
    "<div>hello, {{getValue()}}</div>");
}]);
})();

}).call(global, module, undefined);

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}]},{},[8])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImM6XFxEZXZcXEJ1aWxkaW5nQmxveC5EaXJlY3RpdmVzXFxub2RlX21vZHVsZXNcXGd1bHAtYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJyb3dzZXItcGFja1xcX3ByZWx1ZGUuanMiLCJjOi9EZXYvQnVpbGRpbmdCbG94LkRpcmVjdGl2ZXMvc3JjL2FuZ3VsYXIuYmxveC5kaXJlY3RpdmVzLmpzIiwiYzovRGV2L0J1aWxkaW5nQmxveC5EaXJlY3RpdmVzL3NyYy9kaXJlY3RpdmVzL2RyYWdBcmVhLmpzIiwiYzovRGV2L0J1aWxkaW5nQmxveC5EaXJlY3RpdmVzL3NyYy9kaXJlY3RpdmVzL2RyYWdnYWJsZS5qcyIsImM6L0Rldi9CdWlsZGluZ0Jsb3guRGlyZWN0aXZlcy9zcmMvZGlyZWN0aXZlcy9kcmFnZ2FibGVMaXN0LmpzIiwiYzovRGV2L0J1aWxkaW5nQmxveC5EaXJlY3RpdmVzL3NyYy9kaXJlY3RpdmVzL2Ryb3BhcmVhLmpzIiwiYzovRGV2L0J1aWxkaW5nQmxveC5EaXJlY3RpdmVzL3NyYy9kaXJlY3RpdmVzL2hpZGRlbklucHV0LmpzIiwiYzovRGV2L0J1aWxkaW5nQmxveC5EaXJlY3RpdmVzL3NyYy9kaXJlY3RpdmVzL2xpc3RJdGVtLmpzIiwiYzovRGV2L0J1aWxkaW5nQmxveC5EaXJlY3RpdmVzL3NyYy9oZWxwZXJzL2FycmF5SGVscGVycy5qcyIsImM6L0Rldi9CdWlsZGluZ0Jsb3guRGlyZWN0aXZlcy9zcmMvaGVscGVycy9nZW5lcmF0b3JzLmpzIiwiYzovRGV2L0J1aWxkaW5nQmxveC5EaXJlY3RpdmVzL3NyYy9oZWxwZXJzL2luZGV4LmpzIiwiYzovRGV2L0J1aWxkaW5nQmxveC5EaXJlY3RpdmVzL3NyYy90bXAvdGVtcGxhdGVzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLypnbG9iYWwgYW5ndWxhciwgcmVxdWlyZSwgbW9kdWxlKi9cclxuLypqc2xpbnQgYnJvd3NlcjogdHJ1ZSovXHJcblxyXG5yZXF1aXJlKCd0ZW1wbGF0ZXMnKTtcclxuXHJcbnZhciBhcHAgPSBhbmd1bGFyLm1vZHVsZSgnQnVpbGRpbmdCbG94LkRpcmVjdGl2ZXMnLCBbJ0J1aWxkaW5nQmxveC5EaXJlY3RpdmVzLlRlbXBsYXRlcycsIHJlcXVpcmUoJy4vaGVscGVycycpXSlcclxuICAgIC5wcm92aWRlcignQW5ndWxhckJsb3hEaXJlY3RpdmVzJywgZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICd1c2Ugc3RyaWN0JztcclxuICAgICAgICB2YXIgYmFzZU9wdGlvbnMgPSB7XHJcbiAgICAgICAgICAgICAgICBiYWNrYm9uZTogZmFsc2VcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgZ2V0VmFsdWUgPSBmdW5jdGlvbiAob3B0aW9ucywgbmFtZSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG9wdGlvbnNbbmFtZV0gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnNbbmFtZV0gOiBiYXNlT3B0aW9uc1tuYW1lXTtcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgZnVuY3Rpb24gQW5ndWxhckJsb3hEaXJlY3RpdmVzT3B0aW9ucyhvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmFja2JvbmUgPSBvcHRpb25zLmJhY2tib25lO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5pbml0ID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgYmFzZU9wdGlvbnMuYmFja2JvbmUgPSBnZXRWYWx1ZShvcHRpb25zLCAnYmFja2JvbmUnKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLiRnZXQgPSBbZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IEFuZ3VsYXJCbG94RGlyZWN0aXZlc09wdGlvbnMoYmFzZU9wdGlvbnMpO1xyXG4gICAgICAgIH1dO1xyXG4gICAgfSk7XHJcblxyXG52YXIgZXhwb3J0cyA9IGFwcDtcclxubW9kdWxlLmV4cG9ydHMgPSBhcHA7XHJcblxyXG5yZXF1aXJlKCcuL2RpcmVjdGl2ZXMvZHJhZ0FyZWEuanMnKTtcclxucmVxdWlyZSgnLi9kaXJlY3RpdmVzL2RyYWdnYWJsZS5qcycpO1xyXG5yZXF1aXJlKCcuL2RpcmVjdGl2ZXMvZHJhZ2dhYmxlTGlzdC5qcycpO1xyXG5yZXF1aXJlKCcuL2RpcmVjdGl2ZXMvZHJvcGFyZWEuanMnKTtcclxucmVxdWlyZSgnLi9kaXJlY3RpdmVzL2hpZGRlbklucHV0LmpzJyk7XHJcbnJlcXVpcmUoJy4vZGlyZWN0aXZlcy9saXN0SXRlbS5qcycpOyIsIi8qZ2xvYmFsIGFuZ3VsYXIsIHJlcXVpcmUsIG1vZHVsZSovXHJcbi8qanNsaW50IGJyb3dzZXI6IHRydWUqL1xyXG5cclxudmFyIGludGVyYWN0ID0gd2luZG93LmludGVyYWN0O1xyXG52YXIgYXBwID0gcmVxdWlyZSgnLi4vYW5ndWxhci5ibG94LmRpcmVjdGl2ZXMuanMnKTtcclxuYXBwLmRpcmVjdGl2ZSgnZHJhZ0FyZWEnLCBbZnVuY3Rpb24gKCkge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICByZXN0cmljdDogJ0MnLFxyXG4gICAgICAgIHNjb3BlOiB7XHJcbiAgICAgICAgICAgIHJlbW92ZTogJz0nXHJcbiAgICAgICAgfSxcclxuICAgICAgICBjb250cm9sbGVyOiBbJyRzY29wZScsIGZ1bmN0aW9uICgkc2NvcGUpIHtcclxuICAgICAgICAgICAgdGhpcy5yZW1vdmUgPSAkc2NvcGUucmVtb3ZlO1xyXG4gICAgICAgIH1dXHJcbiAgICB9O1xyXG59XSk7IiwiLypnbG9iYWwgYW5ndWxhciwgcmVxdWlyZSwgbW9kdWxlKi9cclxuLypqc2xpbnQgYnJvd3NlcjogdHJ1ZSovXHJcblxyXG52YXIgaW50ZXJhY3QgPSB3aW5kb3cuaW50ZXJhY3Q7XHJcbnZhciBhcHAgPSByZXF1aXJlKCcuLi9hbmd1bGFyLmJsb3guZGlyZWN0aXZlcy5qcycpO1xyXG5hcHAuZGlyZWN0aXZlKCdkcmFnZ2FibGUnLCBbZnVuY3Rpb24gKCkge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICByZXN0cmljdDogJ0MnLFxyXG4gICAgICAgIHJlcXVpcmU6ICdeZHJhZ0FyZWEnLFxyXG4gICAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0cnMsIGRyYWdBcmVhQ29udHJvbGxlcikge1xyXG4gICAgICAgICAgICB2YXIgaHRtbEVsZW1lbnQgPSBlbGVtZW50WzBdLFxyXG4gICAgICAgICAgICAgICAgaW50ZXJhY3RpYmxlO1xyXG4gICAgICAgICAgICBpbnRlcmFjdGlibGUgPSBpbnRlcmFjdChodG1sRWxlbWVudCk7XHJcbiAgICAgICAgICAgIGludGVyYWN0aWJsZS5kcmFnZ2FibGUoe1xyXG4gICAgICAgICAgICAgICAgb25tb3ZlOiBmdW5jdGlvbiAoZXZlbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB4ID0gKHBhcnNlSW50KHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEteCcpLCAxMCkgfHwgMCkgKyBldmVudC5keCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgeSA9IChwYXJzZUludCh0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXknKSwgMTApIHx8IDApICsgZXZlbnQuZHk7XHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5jc3Moe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAndHJhbnNpdGlvbic6ICcnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnei1pbmRleCc6IDEwMDAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICd0cmFuc2Zvcm0nOiAndHJhbnNsYXRlKCcgKyB4ICsgJ3B4LCAnICsgeSArICdweCknXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5hdHRyKCdkYXRhLXgnLCB4KTtcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LmF0dHIoJ2RhdGEteScsIHkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuYWRkQ2xhc3MoJ3RyYW5zcGFyZW50Jyk7XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgb25lbmQ6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LmNzcyh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICd6LWluZGV4JzogMCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ3RyYW5zZm9ybSc6ICcnXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5hdHRyKCdkYXRhLXgnLCAwKTtcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LmF0dHIoJ2RhdGEteScsIDApO1xyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQucmVtb3ZlQ2xhc3MoJ3RyYW5zcGFyZW50Jyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBpbnRlcmFjdGlibGUuZ2V0SXRlbSA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIGlmIChzY29wZS5pdGVtICYmIHNjb3BlLmdldElkUHJvcGVydHkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuaXRlbTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBpbnRlcmFjdGlibGUucmVtb3ZlID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHNjb3BlLml0ZW0gJiYgc2NvcGUuZ2V0SWRQcm9wZXJ0eSAmJiBkcmFnQXJlYUNvbnRyb2xsZXIucmVtb3ZlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZHJhZ0FyZWFDb250cm9sbGVyLnJlbW92ZShzY29wZS5pdGVtW3Njb3BlLmdldElkUHJvcGVydHkoKV0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbn1dKTsiLCIvKmdsb2JhbCBhbmd1bGFyLCByZXF1aXJlLCBtb2R1bGUqL1xyXG4vKmpzbGludCBicm93c2VyOiB0cnVlKi9cclxuXHJcbnZhciBhcHAgPSByZXF1aXJlKCcuLi9hbmd1bGFyLmJsb3guZGlyZWN0aXZlcy5qcycpO1xyXG5hcHAuZGlyZWN0aXZlKCdkcmFnZ2FibGVMaXN0JywgWydhYmJHZW5lcmF0b3JzJywgJ2FiYkFycmF5SGVscGVycycsIGZ1bmN0aW9uIChnZW5lcmF0b3JzLCBhcnJheUhlbHBlcnMpIHtcclxuICAgICd1c2Ugc3RyaWN0JztcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgcmVzdHJpY3Q6ICdFJyxcclxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3NyYy90ZW1wbGF0ZXMvZHJhZ2dhYmxlTGlzdC5odG1sJyxcclxuICAgICAgICBzY29wZToge1xyXG4gICAgICAgICAgICBtb2RlbDogJz1uZ01vZGVsJyxcclxuICAgICAgICAgICAgZGlzcGxheVByb3BlcnR5OiAnQCcsXHJcbiAgICAgICAgICAgIGlkUHJvcGVydHk6ICdAJyxcclxuICAgICAgICAgICAgbGlzdE5hbWVQcm9wZXJ0eTogJ0AnLFxyXG4gICAgICAgICAgICBsaXN0UHJvcGVydHk6ICdAJ1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgY29udHJvbGxlcjogWyckc2NvcGUnLCBmdW5jdGlvbiAoJHNjb3BlKSB7XHJcbiAgICAgICAgICAgIHZhciBnZXRJZFByb3BlcnR5ID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJHNjb3BlLmlkUHJvcGVydHkgfHwgJ19pZCc7IH0sXHJcbiAgICAgICAgICAgICAgICBnZXREaXNwbGF5UHJvcGVydHkgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAkc2NvcGUuZGlzcGxheVByb3BlcnR5IHx8ICd2YWx1ZSc7IH0sXHJcbiAgICAgICAgICAgICAgICBnZXRMaXN0TmFtZVByb3BlcnR5ID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJHNjb3BlLmxpc3ROYW1lUHJvcGVydHkgfHwgJ25hbWUnOyB9LFxyXG4gICAgICAgICAgICAgICAgZ2V0TGlzdFByb3BlcnR5ID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJHNjb3BlLmxpc3RQcm9wZXJ0eSB8fCAnbGlzdCc7IH0sXHJcbiAgICAgICAgICAgICAgICBnZXRMaXN0ID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJHNjb3BlLm1vZGVsW2dldExpc3RQcm9wZXJ0eSgpXTsgfSxcclxuICAgICAgICAgICAgICAgIG5ld0l0ZW0sXHJcbiAgICAgICAgICAgICAgICBnZXRJbmRleE9mSWQgPSBmdW5jdGlvbiAoaWQsIGRlZmF1bHRWYWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhcnJheUhlbHBlcnMuZmlyc3RSZXR1cm4oZ2V0TGlzdCgpLCBmdW5jdGlvbiAoaXRlbSwgaW5kZXgpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGl0ZW1bZ2V0SWRQcm9wZXJ0eSgpXSA9PT0gaWQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBpbmRleDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0sIGRlZmF1bHRWYWx1ZSk7XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgYWRkQmVmb3JlTGlzdDtcclxuXHJcbiAgICAgICAgICAgICRzY29wZS5nZXRJZFByb3BlcnR5ID0gZ2V0SWRQcm9wZXJ0eTtcclxuICAgICAgICAgICAgJHNjb3BlLmdldERpc3BsYXlQcm9wZXJ0eSA9IGdldERpc3BsYXlQcm9wZXJ0eTtcclxuICAgICAgICAgICAgJHNjb3BlLmdldExpc3ROYW1lUHJvcGVydHkgPSBnZXRMaXN0TmFtZVByb3BlcnR5O1xyXG4gICAgICAgICAgICAkc2NvcGUuZ2V0TGlzdCA9IGdldExpc3Q7XHJcbiAgICAgICAgICAgICRzY29wZS5hZGRUb0xpc3QgPSBmdW5jdGlvbiAoZXYpIHtcclxuICAgICAgICAgICAgICAgIG5ld0l0ZW0gPSBldi5kcmFnZ2FibGUuZ2V0SXRlbSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGdldExpc3QoKS5pbmRleE9mKG5ld0l0ZW0pID49IDApIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBldi5kcmFnZ2FibGUucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAobmV3SXRlbSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGdldExpc3QoKS5wdXNoKG5ld0l0ZW0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYWRkQmVmb3JlTGlzdCA9IHt9O1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBpZiAoISRzY29wZS5tb2RlbCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGFycmF5SGVscGVycy5lYWNoKGdldExpc3QoKSwgZnVuY3Rpb24gKGl0ZW0sIGluZGV4KSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGl0ZW0gIT09ICdvYmplY3QnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmV3SXRlbSA9IHt9O1xyXG4gICAgICAgICAgICAgICAgICAgIG5ld0l0ZW1bZ2V0RGlzcGxheVByb3BlcnR5KCldID0gaXRlbTtcclxuICAgICAgICAgICAgICAgICAgICBpdGVtID0gbmV3SXRlbTtcclxuICAgICAgICAgICAgICAgICAgICBnZXRMaXN0KCkuc3BsaWNlKGluZGV4LCAxLCBpdGVtKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGl0ZW1bZ2V0SWRQcm9wZXJ0eSgpXSA9IGl0ZW1bZ2V0SWRQcm9wZXJ0eSgpXSB8fCBnZW5lcmF0b3JzLmd1aWQoKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICRzY29wZS5tb2RlbFtnZXRMaXN0TmFtZVByb3BlcnR5KCldID0gJHNjb3BlLm1vZGVsW2dldExpc3ROYW1lUHJvcGVydHkoKV0gfHwgJ1VudGl0bGVkJztcclxuXHJcbiAgICAgICAgICAgICRzY29wZS5yZW1vdmVCeUlkID0gZnVuY3Rpb24gKGlkKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgZGVmYXVsdFZhbHVlID0gLTEsXHJcbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlSW5kZXg7XHJcbiAgICAgICAgICAgICAgICByZW1vdmVJbmRleCA9IGdldEluZGV4T2ZJZChpZCwgZGVmYXVsdFZhbHVlKTtcclxuICAgICAgICAgICAgICAgIGlmIChyZW1vdmVJbmRleCAhPT0gZGVmYXVsdFZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGdldExpc3QoKS5zcGxpY2UpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZ2V0TGlzdCgpLnNwbGljZShyZW1vdmVJbmRleCwgMSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGdldExpc3QoKVtyZW1vdmVJbmRleF07XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYWRkQmVmb3JlTGlzdCA9IHt9O1xyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgYWRkQmVmb3JlTGlzdCA9IHt9O1xyXG5cclxuICAgICAgICAgICAgJHNjb3BlLmNyZWF0ZUFkZEJlZm9yZSA9IGZ1bmN0aW9uIChpZCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGRlZmF1bHRWYWx1ZSA9IC0xLFxyXG4gICAgICAgICAgICAgICAgICAgIGlkSW5kZXg7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWFkZEJlZm9yZUxpc3RbJ19pZF8nICsgaWRdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWRJbmRleCA9IGdldEluZGV4T2ZJZChpZCwgZGVmYXVsdFZhbHVlKTtcclxuICAgICAgICAgICAgICAgICAgICBhZGRCZWZvcmVMaXN0WydfaWRfJyArIGlkXSA9IGZ1bmN0aW9uIChldikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgaXRlbSA9IGV2LmRyYWdnYWJsZS5nZXRJdGVtKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2LmRyYWdnYWJsZS5yZW1vdmUoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZ2V0TGlzdCgpLnNwbGljZShpZEluZGV4LCAwLCBpdGVtKTtcclxuICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGFkZEJlZm9yZUxpc3RbJ19pZF8nICsgaWRdO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH1dXHJcbiAgICB9O1xyXG59XSk7IiwiLypnbG9iYWwgYW5ndWxhciwgcmVxdWlyZSwgbW9kdWxlKi9cclxuLypqc2xpbnQgYnJvd3NlcjogdHJ1ZSovXHJcblxyXG52YXIgaW50ZXJhY3QgPSB3aW5kb3cuaW50ZXJhY3Q7XHJcbnZhciBhcHAgPSByZXF1aXJlKCcuLi9hbmd1bGFyLmJsb3guZGlyZWN0aXZlcy5qcycpO1xyXG5hcHAuZGlyZWN0aXZlKCdkcm9wQXJlYScsIFtmdW5jdGlvbiAoKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHJlc3RyaWN0OiAnQycsXHJcbiAgICAgICAgc2NvcGU6IHtcclxuICAgICAgICAgICAgb25Ecm9wOiAnPScsXHJcbiAgICAgICAgICAgIG9uRHJhZ0VudGVyOiAnPScsXHJcbiAgICAgICAgICAgIG9uRHJhZ0xlYXZlOiAnPSdcclxuICAgICAgICB9LFxyXG4gICAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCkge1xyXG4gICAgICAgICAgICB2YXIgaHRtbEVsZW1lbnQgPSBlbGVtZW50WzBdLFxyXG4gICAgICAgICAgICAgICAgaW50ZXJhY3RpYmxlO1xyXG4gICAgICAgICAgICBpbnRlcmFjdGlibGUgPSBpbnRlcmFjdChodG1sRWxlbWVudCk7XHJcbiAgICAgICAgICAgIGludGVyYWN0aWJsZS5kcm9wem9uZSh7XHJcbiAgICAgICAgICAgICAgICBhY2NlcHRzOiAnLmRyYWdnYWJsZScsXHJcbiAgICAgICAgICAgICAgICBkcmFnZW50ZXI6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXNjb3BlLm9uRHJhZ0VudGVyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XHJcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUuJGFwcGx5KGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUub25EcmFnRW50ZXIuYXBwbHkoc2NvcGUsIGFyZ3MpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIGRyYWdsZWF2ZTogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICghc2NvcGUub25EcmFnTGVhdmUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB2YXIgYXJncyA9IGFyZ3VtZW50cztcclxuICAgICAgICAgICAgICAgICAgICBzY29wZS4kYXBwbHkoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzY29wZS5vbkRyYWdMZWF2ZS5hcHBseShzY29wZSwgYXJncyk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgZHJvcDogIGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXNjb3BlLm9uRHJvcCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xyXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLiRhcHBseShmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLm9uRHJvcC5hcHBseShzY29wZSwgYXJncyk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbn1dKTsiLCIvKmdsb2JhbCBhbmd1bGFyLCByZXF1aXJlLCBtb2R1bGUsIGludGVyYWN0Ki9cclxuLypqc2xpbnQgYnJvd3NlcjogdHJ1ZSovXHJcblxyXG52YXIgYXBwID0gcmVxdWlyZSgnLi4vYW5ndWxhci5ibG94LmRpcmVjdGl2ZXMuanMnKTtcclxuYXBwLmRpcmVjdGl2ZSgnaGlkZGVuSW5wdXQnLCBbJ2FiYkFycmF5SGVscGVycycsIGZ1bmN0aW9uIChhcnJheUhlbHBlcnMpIHtcclxuICAgICd1c2Ugc3RyaWN0JztcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgcmVzdHJpY3Q6ICdFJyxcclxuICAgICAgICB0ZW1wbGF0ZTogJzxpbnB1dCAvPicsXHJcbiAgICAgICAgcmVwbGFjZTogdHJ1ZSxcclxuICAgICAgICBzY29wZToge1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHZhciBpbnB1dEVsZW1lbnQgPSBlbGVtZW50LmZpbmQoJ2lucHV0JyksXHJcbiAgICAgICAgICAgICAgICBwYXJlbnRBdHRyaWJ1dGVzID0gZWxlbWVudFswXS5hdHRyaWJ1dGVzO1xyXG5cclxuICAgICAgICAgICAgYXJyYXlIZWxwZXJzLmVhY2gocGFyZW50QXR0cmlidXRlcywgZnVuY3Rpb24gKGF0dHJpYnV0ZU5vZGUpIHtcclxuICAgICAgICAgICAgICAgIGlmIChhdHRyaWJ1dGVOb2RlLnZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaW5wdXRFbGVtZW50LmF0dHIoYXR0cmlidXRlTm9kZS5ub2RlTmFtZSwgYXR0cmlidXRlTm9kZS52YWx1ZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgaW5wdXRFbGVtZW50LmFkZENsYXNzKCdoaWRkZW5JbnB1dCcpO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbn1dKTsiLCIvKmdsb2JhbCBhbmd1bGFyLCByZXF1aXJlLCBtb2R1bGUqL1xyXG4vKmpzbGludCBicm93c2VyOiB0cnVlKi9cclxuXHJcbnZhciBhcHAgPSByZXF1aXJlKCcuLi9hbmd1bGFyLmJsb3guZGlyZWN0aXZlcy5qcycpO1xyXG5hcHAuZGlyZWN0aXZlKCdsaXN0SXRlbScsIFtmdW5jdGlvbiAoKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHJlc3RyaWN0OiAnRScsXHJcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdzcmMvdGVtcGxhdGVzL2xpc3RJdGVtLmh0bWwnLFxyXG4gICAgICAgIHNjb3BlOiB7XHJcbiAgICAgICAgICAgIG1vZGVsOiAnPW5nTW9kZWwnLFxyXG4gICAgICAgICAgICBkaXNwbGF5UHJvcGVydHk6ICdAJ1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgY29udHJvbGxlcjogWyckc2NvcGUnLCAnJGVsZW1lbnQnLCBmdW5jdGlvbiAoJHNjb3BlLCAkZWxlbWVudCkge1xyXG4gICAgICAgICAgICAkc2NvcGUuZ2V0VmFsdWUgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAkc2NvcGUubW9kZWxbJHNjb3BlLmRpc3BsYXlQcm9wZXJ0eSB8fCAndmFsdWUnXTsgfTtcclxuICAgICAgICB9XVxyXG4gICAgfTtcclxufV0pOyIsIi8qZ2xvYmFsIGFuZ3VsYXIsIHJlcXVpcmUsIG1vZHVsZSovXHJcbi8qanNsaW50IGJyb3dzZXI6IHRydWUqL1xyXG5cclxudmFyIGRlZmF1bHRSZXR1cm5WYWx1ZSA9IC1JbmZpbml0eTtcclxuXHJcbmZ1bmN0aW9uIGFycmF5Q2FsbEhlbHBlcihmdW5jLCBhcnIsIGksIG9iaikge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgb2JqID0gb2JqIHx8IGFycltpXTtcclxuICAgIHJldHVybiBmdW5jLmNhbGwob2JqLCBvYmosIGksIGFycik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldERlZmF1bHRWYWx1ZShkZWZhdWx0VmFsdWUpIHtcclxuICAgICd1c2Ugc3RyaWN0JztcclxuICAgIHJldHVybiBkZWZhdWx0VmFsdWUgPT09IHVuZGVmaW5lZCA/IGRlZmF1bHRSZXR1cm5WYWx1ZSA6IGRlZmF1bHRWYWx1ZTtcclxufVxyXG5cclxuLyogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gKi9cclxuXHJcbmZ1bmN0aW9uIGVhY2goYXJyLCBmdW5jKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiAgICB2YXIgaTtcclxuICAgIGZvciAoaSBpbiBhcnIpIHtcclxuICAgICAgICBpZiAoYXJyLmhhc093blByb3BlcnR5KGkpKSB7XHJcbiAgICAgICAgICAgIGFycmF5Q2FsbEhlbHBlcihmdW5jLCBhcnIsIGkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZmlyc3RSZXR1cm4oYXJyLCBmdW5jKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiAgICB2YXIgaSwgdmFsO1xyXG4gICAgZm9yIChpIGluIGFycikge1xyXG4gICAgICAgIGlmIChhcnIuaGFzT3duUHJvcGVydHkoaSkpIHtcclxuICAgICAgICAgICAgdmFsID0gYXJyYXlDYWxsSGVscGVyKGZ1bmMsIGFyciwgaSk7XHJcbiAgICAgICAgICAgIGlmICh2YWwgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gYWxsKGFyciwgZnVuYykge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgdmFyIHZhbDtcclxuICAgIHZhbCA9IGZpcnN0UmV0dXJuKGFyciwgZnVuY3Rpb24gKG9iaiwgaSkge1xyXG4gICAgICAgIHZhbCA9IGFycmF5Q2FsbEhlbHBlcihmdW5jLCBhcnIsIGkpO1xyXG4gICAgICAgIGlmICghdmFsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gdmFsIHx8IGZhbHNlO1xyXG59XHJcblxyXG5mdW5jdGlvbiBhbnkoYXJyLCBmdW5jKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiAgICB2YXIgdmFsO1xyXG4gICAgdmFsID0gZmlyc3RSZXR1cm4oYXJyLCBmdW5jdGlvbiAob2JqLCBpKSB7XHJcbiAgICAgICAgdmFsID0gYXJyYXlDYWxsSGVscGVyKGZ1bmMsIGFyciwgaSk7XHJcbiAgICAgICAgaWYgKHZhbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gdmFsIHx8IGZhbHNlO1xyXG59XHJcblxyXG5mdW5jdGlvbiB3aGVyZShhcnIsIGZ1bmMpIHtcclxuICAgICd1c2Ugc3RyaWN0JztcclxuICAgIHZhciBvdXQgPSBbXTtcclxuICAgIGVhY2goYXJyLCBmdW5jdGlvbiAob2JqLCBpKSB7XHJcbiAgICAgICAgaWYgKGFycmF5Q2FsbEhlbHBlcihmdW5jLCBhcnIsIGkpKSB7XHJcbiAgICAgICAgICAgIG91dC5wdXNoKG9iaik7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gb3V0O1xyXG59XHJcblxyXG5mdW5jdGlvbiBzaW5nbGUoYXJyLCBmdW5jLCBkZWZhdWx0VmFsdWUpIHtcclxuICAgICd1c2Ugc3RyaWN0JztcclxuICAgIHZhciBvdXQsIG91dElzU2V0O1xyXG4gICAgZGVmYXVsdFZhbHVlID0gZ2V0RGVmYXVsdFZhbHVlKGRlZmF1bHRWYWx1ZSk7XHJcbiAgICBpZiAodHlwZW9mIGZ1bmMgPT09IFwiZnVuY3Rpb25cIikge1xyXG4gICAgICAgIG91dCA9IGRlZmF1bHRWYWx1ZTtcclxuICAgICAgICBvdXRJc1NldCA9IHRydWU7XHJcbiAgICAgICAgZWFjaChhcnIsIGZ1bmN0aW9uIChvYmosIGkpIHtcclxuICAgICAgICAgICAgaWYgKGFycmF5Q2FsbEhlbHBlcihmdW5jLCBhcnIsIGkpKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAob3V0SXNTZXQpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZGVmYXVsdFZhbHVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgb3V0SXNTZXQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgb3V0ID0gb2JqO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIG91dDtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoYXJyLmxlbmd0aCAhPT0gMSkge1xyXG4gICAgICAgIHJldHVybiBnZXREZWZhdWx0VmFsdWUoZGVmYXVsdFZhbHVlKTtcclxuICAgIH1cclxuICAgIHJldHVybiBhcnJbMF07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZpcnN0KGFyciwgZnVuYywgZGVmYXVsdFZhbHVlKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcblxyXG4gICAgaWYgKGFyci5sZW5ndGggPCAxKSB7XHJcbiAgICAgICAgcmV0dXJuIGdldERlZmF1bHRWYWx1ZShkZWZhdWx0VmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0eXBlb2YgZnVuYyA9PT0gXCJmdW5jdGlvblwiKSB7XHJcbiAgICAgICAgZWFjaChhcnIsIGZ1bmN0aW9uIChvYmosIGkpIHtcclxuICAgICAgICAgICAgaWYgKGFycmF5Q2FsbEhlbHBlcihmdW5jLCBhcnIsIGkpKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gb2JqO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIGdldERlZmF1bHRWYWx1ZShkZWZhdWx0VmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBhcnJbMF07XHJcbn1cclxuXHJcbnZhciBhcnJheUhlbHBlcnMgPSB7XHJcbiAgICBlYWNoOiBlYWNoLFxyXG4gICAgZmlyc3RSZXR1cm46IGZpcnN0UmV0dXJuLFxyXG4gICAgYWxsOiBhbGwsXHJcbiAgICBhbnk6IGFueSxcclxuICAgIHdoZXJlOiB3aGVyZSxcclxuICAgIHNpbmdsZTogc2luZ2xlLFxyXG4gICAgZmlyc3Q6IGZpcnN0XHJcbn07XHJcblxyXG5PYmplY3QuZnJlZXplKGFycmF5SGVscGVycyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGFycmF5SGVscGVyczsiLCIvKmdsb2JhbCBhbmd1bGFyLCByZXF1aXJlLCBtb2R1bGUqL1xyXG4vKmpzbGludCBicm93c2VyOiB0cnVlKi9cclxuXHJcbmZ1bmN0aW9uIHJhbmRIZXgoKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiAgICB2YXIgcmFuZCA9IE1hdGgucmFuZG9tKCk7XHJcbiAgICByYW5kID0gcGFyc2VJbnQocmFuZCAqIDE2LCAxMCk7XHJcbiAgICByZXR1cm4gcmFuZC50b1N0cmluZygxNik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGd1aWQoKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiAgICB2YXIgaSxcclxuICAgICAgICBvdXRwdXQgPSAnJztcclxuXHJcbiAgICBmb3IgKGkgPSAwOyBpIDwgODsgaSsrKSB7XHJcbiAgICAgICAgb3V0cHV0ICs9IHJhbmRIZXgoKTtcclxuICAgIH1cclxuICAgIG91dHB1dCArPSAnLSc7XHJcbiAgICBmb3IgKGkgPSAwOyBpIDwgNDsgaSsrKSB7XHJcbiAgICAgICAgb3V0cHV0ICs9IHJhbmRIZXgoKTtcclxuICAgIH1cclxuICAgIG91dHB1dCArPSAnLTQnO1xyXG4gICAgZm9yIChpID0gMDsgaSA8IDM7IGkrKykge1xyXG4gICAgICAgIG91dHB1dCArPSByYW5kSGV4KCk7XHJcbiAgICB9XHJcbiAgICBvdXRwdXQgKz0gJy0nO1xyXG4gICAgZm9yIChpID0gMDsgaSA8IDQ7IGkrKykge1xyXG4gICAgICAgIG91dHB1dCArPSByYW5kSGV4KCk7XHJcbiAgICB9XHJcbiAgICBvdXRwdXQgKz0gJy0nO1xyXG4gICAgZm9yIChpID0gMDsgaSA8IDEyOyBpKyspIHtcclxuICAgICAgICBvdXRwdXQgKz0gcmFuZEhleCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBvdXRwdXQ7XHJcbn1cclxuXHJcbnZhciBnZW5lcmF0b3JzID0ge1xyXG4gICAgcmFuZEhleDogcmFuZEhleCxcclxuICAgIGd1aWQ6IGd1aWRcclxufTtcclxuXHJcbk9iamVjdC5mcmVlemUoZ2VuZXJhdG9ycyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGdlbmVyYXRvcnM7IiwiLypnbG9iYWwgYW5ndWxhciwgcmVxdWlyZSwgbW9kdWxlKi9cclxuLypqc2xpbnQgYnJvd3NlcjogdHJ1ZSovXHJcblxyXG52YXIgbW9kdWxlTmFtZSA9ICdBQkIuSGVscGVycyc7XHJcblxyXG52YXIgYXBwID0gYW5ndWxhci5tb2R1bGUobW9kdWxlTmFtZSwgW10pO1xyXG5cclxuYXBwLnZhbHVlKCdhYmJBcnJheUhlbHBlcnMnLCByZXF1aXJlKCcuL2FycmF5SGVscGVycy5qcycpKTtcclxuYXBwLnZhbHVlKCdhYmJHZW5lcmF0b3JzJywgcmVxdWlyZSgnLi9nZW5lcmF0b3JzLmpzJykpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBtb2R1bGVOYW1lOyIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbihmdW5jdGlvbiBicm93c2VyaWZ5U2hpbShtb2R1bGUsIGRlZmluZSkge1xuKGZ1bmN0aW9uKG1vZHVsZSkge1xudHJ5IHsgbW9kdWxlID0gYW5ndWxhci5tb2R1bGUoXCJCdWlsZGluZ0Jsb3guRGlyZWN0aXZlcy5UZW1wbGF0ZXNcIik7IH1cbmNhdGNoKGVycikgeyBtb2R1bGUgPSBhbmd1bGFyLm1vZHVsZShcIkJ1aWxkaW5nQmxveC5EaXJlY3RpdmVzLlRlbXBsYXRlc1wiLCBbXSk7IH1cbm1vZHVsZS5ydW4oW1wiJHRlbXBsYXRlQ2FjaGVcIiwgZnVuY3Rpb24oJHRlbXBsYXRlQ2FjaGUpIHtcbiAgJHRlbXBsYXRlQ2FjaGUucHV0KFwic3JjL3RlbXBsYXRlcy9kcmFnZ2FibGVMaXN0Lmh0bWxcIixcbiAgICBcIjxkaXYgY2xhc3M9XFxcImRyYWdBcmVhXFxcIiByZW1vdmU9XFxcInJlbW92ZUJ5SWRcXFwiPlxcblwiICtcbiAgICBcIiAgICA8ZGl2IGNsYXNzPVxcXCJwYW5lbCBwYW5lbC1wcmltYXJ5IGRyb3BBcmVhXFxcIiBvbi1kcm9wPVxcXCJhZGRUb0xpc3RcXFwiPlxcblwiICtcbiAgICBcIiAgICAgICAgPGRpdiBjbGFzcz1cXFwicGFuZWwtaGVhZGluZ1xcXCI+PGlucHV0IGNsYXNzPVxcXCJoaWRkZW4taW5wdXRcXFwiIG5nLW1vZGVsPVxcXCJtb2RlbFtnZXRMaXN0TmFtZVByb3BlcnR5KCldXFxcIiAvPjwvZGl2PlxcblwiICtcbiAgICBcIiAgICAgICAgPGRpdiBjbGFzcz1cXFwibGlzdC1ncm91cC1pdGVtIGRyb3BBcmVhIGRyYWdnYWJsZVxcXCIgb24tZHJvcD1cXFwiY3JlYXRlQWRkQmVmb3JlKGl0ZW1bZ2V0SWRQcm9wZXJ0eSgpXSlcXFwiIG5nLXJlcGVhdD1cXFwiKGluZGV4LCBpdGVtKSBpbiBnZXRMaXN0KCkgdHJhY2sgYnkgaXRlbVtnZXRJZFByb3BlcnR5KCldXFxcIiBuZy1pZj1cXFwiaW5kZXggIT0gZ2V0TGlzdE5hbWVQcm9wZXJ0eSgpXFxcIj5cXG5cIiArXG4gICAgXCIgICAgICAgICAgICA8bGlzdC1pdGVtIG5nLW1vZGVsPVxcXCJpdGVtXFxcIiBkaXNwbGF5LXByb3BlcnR5PVxcXCJ7e2dldERpc3BsYXlQcm9wZXJ0eSgpfX1cXFwiPjwvbGlzdC1pdGVtPlxcblwiICtcbiAgICBcIiAgICAgICAgPC9kaXY+XFxuXCIgK1xuICAgIFwiICAgIDwvZGl2PlxcblwiICtcbiAgICBcIjwvZGl2PlwiKTtcbn1dKTtcbn0pKCk7XG5cbihmdW5jdGlvbihtb2R1bGUpIHtcbnRyeSB7IG1vZHVsZSA9IGFuZ3VsYXIubW9kdWxlKFwiQnVpbGRpbmdCbG94LkRpcmVjdGl2ZXMuVGVtcGxhdGVzXCIpOyB9XG5jYXRjaChlcnIpIHsgbW9kdWxlID0gYW5ndWxhci5tb2R1bGUoXCJCdWlsZGluZ0Jsb3guRGlyZWN0aXZlcy5UZW1wbGF0ZXNcIiwgW10pOyB9XG5tb2R1bGUucnVuKFtcIiR0ZW1wbGF0ZUNhY2hlXCIsIGZ1bmN0aW9uKCR0ZW1wbGF0ZUNhY2hlKSB7XG4gICR0ZW1wbGF0ZUNhY2hlLnB1dChcInNyYy90ZW1wbGF0ZXMvbGlzdEl0ZW0uaHRtbFwiLFxuICAgIFwiPGRpdj5oZWxsbywge3tnZXRWYWx1ZSgpfX08L2Rpdj5cIik7XG59XSk7XG59KSgpO1xuXG59KS5jYWxsKGdsb2JhbCwgbW9kdWxlLCB1bmRlZmluZWQpO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSJdfQ==
