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
    - `callback` callback on completeion with `error, uid` 
  

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
 - `uid` the unique identifier for of the acting party. derived from thumos' [authentication](#authentication)
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
 - `auth.uid` property, set to authenticated id (id authenticated)

# API

## view api
requireing a view with `view!` gives you a constructor whose arguments will be passed to the view's `init`. the constructor returns the dom of the view.

## set api
- `set.get(ids, callback)` retrieves models by id, calls back with [resultset](#resultset-api)
- `set.getOne(id, callback)` retrieves model by id, calls back single model
- `set.update(data, callback)` updates set, returns changed models
- `set.del(ids, callback)` removes models by id, returns list of removed ids
- `set.add(data, callback)` adds array of model data, calls back with added [resultset](#resultset-api)
- `set.find(props, callback)` returns resultset of models where properties are equal to parameter `props`
- `set.findOne(props, callback)` returns a single model
- `set.query(query, params, callback)` query a set, callback with [resultset](#resultset-api)
- `set.group(input)` follow a subset of models in a set determined by input (models or predicate function to filter availiable models in the set). one initialized it returns a [group object](#group-api)
  
## group api
  - `group.on(event, callback)` add a listener for one of the following events:
    - `add` when a new model enters the group
    - `update` when a model in the group changes value
    - `del` when a model leaves the group calls back with **ID only**
  - `group.off(event)` disable callback for event
  - `group.prop(propName, callback)` add a listener for changed properties within the group. calls back with paremeters `callback(propValue, whichModel)` where propValue is the value, and whichModel is the id of the model in question
  - `group.models(callback)` attach a listener to add del and update, calls back with entire group
  - `group.bind(input)` update which models should now be tracked by the group, retiggers events as needed. `input` is a model, array of models or a testing function
  - `group.order(predicate, reverse)` set the ordering function of the set. predicate may be a function that takes in a model and returs the value to be sorted from, or a string naming the property to be sorted on. reverse (optional) reverses the sort order. Calls to add/update events have a second parameter (the index in the sorted order)
  - [`underscore funtions`](http://underscorejs.org/#collections) (collection functions only) proxy to their underscore equivalents. a call to one of these functions returns a function to which you may pass a callback to catch the return value of the underscore function (if any). see example:
    
    ~~~ Javascript
   mygroup.pluck('name')(function(names){
      console.log(names)
   });
    ~~~

# Included Loaders
 - `css!` client side only: parses with [less](http://lesscss.org/), minifies and appends css to page
 - `datauri!` uses [datauri](https://github.com/heldr/datauri), defines as string of datauri
 - `file!` includes a copy of the file (or directory) in the build directory
 - `html!` minifies and includes html file. accessible as jquery element
 - `set!` includes a set definition, handles server side setup and gives you [`set api`](#set-api)
 - `text!` includes a file as a utf-8 string
 - `view!` includes a view definition, provides [`view api`](#view-api)

# Included Dependencies
 - [express](http://expressjs.com/) server side routing goodness
   - [cookie-parser](https://github.com/expressjs/cookie-parser)
   - [body-parser](https://github.com/expressjs/body-parser)
 - [mongojs](https://github.com/mafintosh/mongojs) mongo api in node
 - [jquery](https://jquery.com/) client side dom management
 - [async](https://github.com/caolan/async) async control flow
 - [postcss](https://github.com/postcss/postcss) css processor  
 - [autoprefixer](https://github.com/postcss/autoprefixer) handles browser prefixes at build time
 - [rimraf](https://github.com/isaacs/rimraf) rm -rf
 - [cheerio](https://github.com/cheeriojs/cheerio) server side dom management
 - [node-memcached](https://github.com/3rd-Eden/memcached) memcached for node
 - [bcrypt](https://github.com/ncb000gt/node.bcrypt.js) password hash
 - [crc-32](https://github.com/SheetJS/js-crc32) crc32 checksumming for detecting when to fire `change` events
 - [datauri](https://github.com/heldr/datauri) get data uri from file
