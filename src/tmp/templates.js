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
