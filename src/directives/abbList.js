/*global angular, require, module*/
/*jslint browser: true*/

var app = require('../buildingBlox.directives.js');
app.directive('abbList', ['abbGenerators', 'abbArrayHelpers', function (generators, arrayHelpers) {
    'use strict';
    return {
        restrict: 'E',
        templateUrl: 'src/templates/abbList.html',
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
                newItem;

            $scope.getIdProperty = getIdProperty;
            $scope.getDisplayProperty = getDisplayProperty;
            $scope.getListNameProperty = getListNameProperty;
            $scope.getList = getList;
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
        }]
    };
}]);