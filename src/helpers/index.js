/*global angular, require, module*/
/*jslint browser: true*/

var moduleName = 'ABB.Helpers';

var app = angular.module(moduleName, []);

app.value('abbArrayHelpers', require('./arrayHelpers.js'));
app.value('abbGenerators', require('./generators.js'));

module.exports = moduleName;