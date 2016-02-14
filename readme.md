# Thumos
it does some serious shit™
 - [`configuration`](#configuration)
   - [`views`](#creating-views)
   - [`set`](#creating-sets)
     - [`middleware`](#set-middleware)
     - [`access`](#access-control)
     - [`queries`](#queries)
   - [`authentication`](#authentication)
 - [`api`](#api)
   - [`views`](#view-api)
   - [`sets`](#set-api)
     - [`groups`](#group-api)
     - [`subsets`](#subset-api)
 - [`loaders`](#included-loaders)
 - [`dependencies`](#included-dependencies)
   
# Configuration

## thumos(options, callback)
setup a new thumos build given options:
  - `mongo` db info with auth if needed. see [mongo connection strings](http://docs.mongodb.org/manual/reference/connection-string/)
  - `path` **path**: output destination for the build files 
  - `pages` **array**: of objects specifying build pages:
    - `title` title for page
    - `view` **path**: of thumos view modules
    - `url` **path**: of page destination relative to build root
  - `paths` **object**: bilt path specific configs, see https://github.com/satchelspencer/bilt#configuration-options
  - `app` **express app**: express app to build model API routes on
  - `route` : base route for thumos (defaults to '/')
  - `auth` : authentication function used by the [authentication module](#authentication). called with params:
    - `cred` arbitrary credentials parameter, passed from `auth.get`
    - `callback` callback on completeion with `error, uid, [userdata]` user data will be passed as the `data` property in access query/middleware context. 
  

## creating views
view objects have the following properties:
  - `html`: html string for dom to be inserted at render
  - `init(view, options)` **fn**: init callback called with view dom `view` and any options passed into the constructor

*once required views return a function that must be called to initialize a new instance of the view*

example definition:
~~~ javascript
define([
  'css!./index.css', //css dep
], {
  html : require('html!./index.html'),
  init : function(options){
    // setup your view
  }
})
~~~

## creating sets
sets are a queryable, updateable collection of multiple models. they sync with the client and the server.
 - `name` set name (usually plural of model name) used in url routing
 - `collection` mongo collection (defaults to `name`)
 - `properties` : object of properties, or [validator](#property-validators). properties each may have the following options:
   - `optional` : true if property is not required in model
   - `readonly` : true if client should not be able to modify the property
   - `plural` : true if property should expect array
   - validation through [set middleware](#set-middleware). key is the middleware name, value is the function.
 - `access` [access module](#access-module) default access controls for entire set
 - `queries` object of set [queries](#queries)
 - `routes` object with keys being route names and values being [middleware](http://expressjs.com/en/guide/using-middleware.html) for that route. default method is `get`. more options can be included in the value with the followig format:
   - `route` path for express route
   - `method` http method for route get, post, etc
   - `middleware` express middleware function
 
### set middleware
set middleware are functions that are passed a model at various stages in thumos. middleware functions always have 3 parameters:
 - `input` the value of a model's property (or the entire model)
 - `callback` a function with 2 arguments `error` and `value`. error will stop the current function and if supplied, value will replace the `input` to the middleware
 - `context` the unique identifier for of the acting party. derived from thumos' [authentication](#authentication) contains the properties:
   - `uid` user's unique id
   - `data` any data saved by the authentication module
the available middleware bindings are `valid, send, store, remove`. they are called in the following order:
 - `add/update`
   1. client calls `set.add` or `set.update`
   2. `send` is called on each model
   3. `valid` is called on each model
   4. the browser sends the models to the server
   5. `valid` is called on each model (on the server)
   6. `store` is called on each model (on the server)
   7. the model is saved to the database
 - `delete`
   1. client calls `set.delete`
   2. request is sent to server
   3. `remove` is called on each model (on the server)
   4. the models are removed from the database

you may also provide typestrings `string`, `number`, `object`, and `bool` as shorthand validators. a reference to a set will validate that peoprety represents an object ID accessible by the user

### access control
thumos allows custom access control mechanisms defined by the following object:
 - `read` : query function that is passed the id of the requester, selects models that are eligible to be accessed
 - `write` : same but for modifiable models

### queries
queries are defined by function that takes an object of parameters and returns a mongodb query object example:
~~~ javascript
minAge : function(age){
  return {age : {$gt : age}}
}
~~~

# authentication 
thumos' authentication is controlled through the global module `auth` with the following api:
 - `auth.get(cred, callback)` pass credentials parameter to server side for validation defined by [`config.auth`](#configuration). calls back with `error, uid`
 - `auth.revoke(callback)` revokes authentication, calls back with success status
 - `auth.bind(callback)` add callback to authentication events, calls back with uid or null
 - `auth.uid` property, set to authenticated id (id authenticated)

# API

## view api
requireing a view with `view!` gives you a constructor whose arguments will be passed to the view's `init`. the constructor returns the dom of the view.

## set api
- `set.get(ids, callback)` retrieves models by id, calls back with array of models
- `set.getOne(id, callback)` retrieves model by id, calls back single model
- `set.update(data, callback)` updates set, returns array of changed models
- `set.remove(ids, callback)` removes models by id, returns list of removed ids
- `set.insert(data, callback)` adds array of model data, calls back with added array of models
- `set.find(query, callback)` gets array of models who match query
- `set.findOne(query, callback)` gets first model that matches query

*browser only methods*

- `set.load(ids, callback)` *ignores cache* and retrieves models from server
- `set.group(options_or_query)` creates a [group object](#group-api) for all models matching provided `query` or options:
  - `query` query object to define group
  - `include : function(model, callback)` **optional** function to modify model to be included in group
  - `exclude : function(model, callback)` **optional** function to modify model to be excluded from group
- `set.subset(ids)` creates a [subset object](#subset-api) for the models in `ids`
  
## group api
 - `group.get(ids, callback)` same as `set.get` but models must be in group
 - `group.getOne(id, callback)` get a single model in the group
 - `group.load(ids, callback)` load models in group from server
 - `group.find(query, callback)` query for models in group
 - `group.findOne(query, callback)` calls back with first model in group that matches query
 - `group.insert(models, callback)` *include function required* inserts models, and makes sure they are included in group
 - `group.update(models, callback)` same as `set.update` but models must be in group. update *can* exclude models from group
 - `group.include(models, callback)` *include function required* updates provided models to ensure they are in group.
 - `group.exclude(models, callback)` *exclude function required* updates provided models to ensure they are no longer in group.
 - `group.group(options)` creates a subgroup (with group api) that conforms to current group and its own querys. subgroups:
   - only contain models that are in their parent groups
   - include (or insert) includes the model in subgroup and *all* parent groups
   - exclude from group *does not* exclude it from any parent or subgroups (for now)
   - removal from a parent group implies removal from all subgroups
 - `group.bind(options)` updates group `query, include and exclude` using the same constructor and retriggering events as needed
 - `group.order(predicate, reverse)` set the ordering function of the set. predicate may be a function that takes in a model and returs the value to be sorted from, or a string naming the property to be sorted on. reverse (optional) reverses the sort order. Calls to `include` and `update` events have a second parameter (the index in the sorted order)
 - `group.on(event, callback)` add a listener for one of the following events:
    - `include` when a new model enters the group
    - `exclude` when a model leaves the group calls back with **ID only**
    - `update` when a model in the group changes value
    - `change` calls back with full list of models on any change
 - `group.off(event)` disable callbacks for event
 - [`underscore funtions`](http://underscorejs.org/#collections) (collection functions excluding `find` only) proxy to their underscore equivalents. a call to one of these functions returns a function to which you may pass a callback to catch the return value of the underscore function (if any). see example:
    
    ~~~ Javascript
   mygroup.pluck('name')(function(names){
      console.log(names)
   });
    ~~~

## subset api
 - `subset.bind(ids)` updates subset to be equal to the provided ids
 - `subset.include(ids, callback)` adds models to subset
 - `subset.exclude(ids, callback)` removes models from subset
 - `subset.insert(models, callback)` inserts models into set then appends them to the subset
 - `subset.on(event, callback)` add a listener for one of the following events:
    - `include` when a new model enters the subset
    - `exclude` when a model leaves the subset calls back with **ID only**
    - `update` when a model in the subset changes value
    - `change` calls back with full list of models in subset
 - `subset.off(event)` disable callbacks for event
 - `subset.prop(propName, callback)` add a listener for changed properties within the group. calls back with paremeters `callback(propValue, whichModel)` where propValue is the value, and whichModel is the id of the model in question
 - same underscore functions as a group

# Included Loaders
 - `css!` client side only: parses with [less](http://lesscss.org/), minifies and appends css to page
 - `datauri!` uses [datauri](https://github.com/heldr/datauri), defines as string of datauri
 - `file!` includes a copy of the file (or directory) in the build directory
 - `html!` minifies and includes html file. accessible as jquery element
 - `set!` includes a set definition, handles server side setup and gives you [`set api`](#set-api)
 - `text!` includes a file as a utf-8 string
 - `view!` includes a view definition, provides [`view api`](#view-api)
 - `browserify!` includes a file and its dependencies using [browserify](http://browserify.org/)!

# Included Dependencies
 - [async](https://github.com/caolan/async) async control flow
 - [autoprefixer](https://github.com/postcss/autoprefixer) handles browser prefixes at build time
 - [bcrypt](https://github.com/ncb000gt/node.bcrypt.js) password hash
 - [bilt](https://github.com/satchelspencer/bilt) module loader
 - [browserify](http://browserify.org/) commonjs module loader bult tool
 - [cheerio](https://github.com/cheeriojs/cheerio) server side dom management
 - [crc-32](https://github.com/SheetJS/js-crc32) crc32 checksumming for detecting when to fire `change` events
 - [csso](https://github.com/css/csso) css optimizer
 - [datauri](https://github.com/heldr/datauri) get data uri from file
 - [derequire](https://www.npmjs.com/package/derequire) sanitize require calls
 - [express](http://expressjs.com/) server side routing goodness
   - [cookie-parser](https://github.com/expressjs/cookie-parser)
   - [body-parser](https://github.com/expressjs/body-parser)
 - [fs-extra](https://github.com/jprichardson/node-fs-extra) extended node file library
 - [get-installed-path](https://github.com/tunnckoCore/get-installed-path) finds path of npm package
 - [html-minifier](https://github.com/kangax/html-minifier) self-explanatory
 - [jquery](http://lmgtfy.com/?q=what+is+jquery)
 - [less](http://lesscss.org/) css extention
 - [memcached](https://github.com/3rd-Eden/memcached) memcached for node
 - [mongo-parse](https://github.com/fresheneesz/mongo-parse) test mongodb querys in javascript
 - [mongojs](https://github.com/mafintosh/mongojs) mongo api in node
 - [postcss](https://github.com/postcss/postcss) css processor
 - [sqwish](https://www.npmjs.com/package/sqwish) css compressor
 - [through](https://github.com/dominictarr/through) transformation streams
 - [underscore](http://underscorejs.org/) functional javascript shit