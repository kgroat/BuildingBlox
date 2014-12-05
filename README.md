![Angular Building Blox](Angular_Building_Blox_Logo_SM.png)
An angular boilerplate module
------------

**BuildingBlox.Directives** contains several useful AngularJS directives.

Currently, the module contains a framework for drag-and-drop functionality.
It can be used like so:
```
<div class="dragArea">
    The dragArea container is technically not necessary, but it will ensure that touch events
    triggered inside do not cause scrolling, but instead will drag elements as expected.
    <div class="dropArea" on-drag-enter="enterFunction" on-drag-leave="leaveFunction" on-drop="dropFunction">
        When the draggable element enters, leaves, or is dropped into this div, the appropriate event handler function will be called.
    </div>
    <div class="draggable">
        This div will be draggable.
    </div>
</div>
```

A helpful directive implementing this drag-and-drop functionality is included.
It is a list whose items can be dragged in order to rearrange, and elements can be dragged from one list into another.
It can be used like so:

What a list object might look like:
```
app.controller('myController', function($scope) {
    $scope.myListObject = {
        name: 'My List',
        list: [
            { _id: 001, value: 'Item 1' },
            { _id: 002, value: 'Item 2' },
        ]
    };
});
```

What the HTML might look like for the above list object:
```
<div ng-controller="myController">
    <draggable-list ng-model="myListObject" id-property="_id" display-property="value" list-name-property="name" list-property="list"></draggable-list>
</div>
```

The directive uses the `id-property` attribute to determine the unique identifier for each list item,
`display-property` for what text to show for each list item,
`list-name-property` for what property on the list object should be used as the heading,
and `list-property` for what the property on the list object actually refers to the list.
Each of these attributes has a default value, which are the same as those used in the example.

Dependencies
------------
* angular *(Required)*
* interact *(Required for drag-and-drop functionality)*
* bootstrap *(Recommended for use with draggable-list)*