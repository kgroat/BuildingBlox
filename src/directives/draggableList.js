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