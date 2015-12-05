# Thumos
it does some serious shit
 - [`configuration`](#configuration)
   - [`views`](#creating-views)
   - [`set`](#creating-sets)
   - [`access`](#access-modules)
   - [`queries`](#queries)
   - [`authentication`](#authentication)
 - [`api`](#api)
   - [`views`](#view-api)
   - [`sets`](#set-api)
 - [`loaders`](#included-loaders)
 - [`dependencies`](#included-dependencies)
   
# Configuration

## thumos.init(options, callback)
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
  - `auth` : [authentication plugin](#authentication)
  

## creating views
view objects have the following properties:
  - `html`: html string for dom to be inserted at render
  - `init(options)` **fn**: init callback. `this` contains [view api](#view-api)
  - `fn` : object of functions. that will be appended to the view api, also accessible from init function

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
 - `properties` : object of properties, or [validator](#property-validators). properties can simply be a model or be defined as so:
   - `valid` : [validator function](#property-validators) that calls back with validity of property
   - `type` : [property type](#custom-property-types)
   - `listed` : bool if model should be included in list
   - `onchange : function(model, callback)` called on change of value for model callback optionally with new value for *entire* model or error
   - `compute : function(model, callback)` called on model change, callback sets the value of the property based on the whole model
 - `access` [access module](#access-module) default access controls for entire set
 - `queries` object of set [queries](#queries)
 - `functions` object of custom functions that act on multiple models in a set

## custom property types
property types are passed to thumos as an object with the following properties:
 - `init : function(thumosConfig, props, callback)` called once for this type
   - `thumosConfig` thumos' [config object](#configuration)
   - `props` object with keys as identifiers of initlized properties, values are the configs for each instance
 - `api : function(identifier, propConfig, callback)` setup for each property
   - `identifier` unique string value representing which property is being initiaized
   - `propConfig` config options passed in with property
   - `callback(e, api)` when finished call back with api containing any of the following:
     - `encode : function(value, callback)` modify value when saving object
     - `decode : function(value, callback)` modify value retrieving object
     - `finalize : function(value, callback)` **server** modify on succesful server side save
     - `purge : function(value, callback)` **server** called on object deletion
 
## property validators
a function with arguments `input` and `callback` takes input does some operation and calls back with error as first parameter and new value as second. example:
~~~javascript
function(name, callback){
  if(!name.match(/(.*){5,}/)) callback('name must be at least 5 chars long');
  else callback(null, name.toLowerCase());
}
~~~

## access modules
access modules are an object with four properties `read` `write` `add` `delete` each is defined by either
 - [`query`](#queries) that is passed user id. has better performance, especially on read which governs queries from mongodb
 - `function(user, callback)` uid is the user id. keep in mind code is run on server

## queries
queries are defined by function that takes an object of parameters and returns a mongodb query object example:
~~~ javascript
minAge : function(age){
  return {age : {$gt : age}}
}
~~~

## authentication 
thumos allows custom authentication mechanisms defined by the following object:
 - `init` : `function(set, callback)` setup any routes you will need, calls back with a router to be used on app
 - `verify` : `function(req, res, next)` [express](http://expressjs.com/) middleware. MUST set req.user to some unique id/access token

thumos by default sets up an email/password based authentication mechanism. cookie based sessions based on [this paper](http://www.cse.msu.edu/~alexliu/publications/Cookie/cookie.pdf). It takes the following options:
 - `set` path to userset
 - `id` name of property to store id
 - `pass` name of property to store password ([bcrypt](https://github.com/ncb000gt/node.bcrypt.js) password hash)
 - `sessionLength` number of seconds to persist session, defaults to 3600 (1hr)
 - `memcached`, defaults to 'localhost:11211'

# API

## view api
- `view.render(selecta, options)` render the view into a parent passing arbitrary options
  - `selecta` jquery selector for view to be inserted into
  - `options` object that is passed to the view's init function
- `view.$(selecta)` selects with jquery within the view
- `view.dom` jquery object of view
- `view.on(event, callback)` binds `callback` to view when event is triggered
- `view.off(event)` turns off event on view
- `view.trigger(event)` trigger event on view

## set api
- `set.get(ids, callback)` retrieves models by id, calls back with [resultset](#resultset-api)
- `set.getOne(id, callback)` retrieves model by id, calls back single model
- `set.update(data, callback)` updates set, returns changed models
- `set.del(ids, callback)` removes models by id, returns list of removed ids
- `set.add(data, callback)` adds array of model data, calls back with added [resultset](#resultset-api)
- `set.find(props, callback)` returns resultset of models where properties are equal to parameter `props`
- `set.findOne(props, callback)` returns a single model
- `set.query(query, params, callback)` query a set, callback with [resultset](#resultset-api)
- `set.on(event, which, callback)` binds `callback` to `which` (array of models or ids) when [`event`](#events) is triggered
- `set.off(event, which)` turns off [`event`](#events) on models
- `set.trigger(event, which)` trigger [`event`](#events) on models
- `set.group(input)` follow a subset of models in a set determined by input (models or predicate function to filter availiable models in the set). one initialized it returns a chaining object with the followoing properties:
  - `group.on(event, callback)` add a listener for one of the following events:
    - `add` when a new model enters the group
    - `update` when a model in the group changes value
    - `del` when a model leaves the group calls back with **ID only**
  - `group.off(event)` disable callback for event
  - `group.prop(propName, callback)` add a listener for changed properties within the group. calls back with paremeters `callback(propValue, whichModel)` where propValue is the value, and whichModel is the id of the model in question
  - `group.models(callback)` attach a listener to add del and update, calls back with entire group
  - `group.bind(input)` update which models should now be tracked by the group, retiggers events as needed
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
 - [requirejs](http://requirejs.org/) core of loading/build
   - [requirejs-text](https://github.com/requirejs/text) load text/html
   - [require-less](https://github.com/guybedford/require-less) require css/less and build
   - [require-css](https://github.com/guybedford/require-less) require plain css and build
     - [csso](https://github.com/css/csso) css optimizer/minifier
     - [less](http://lesscss.org/) less parser
   - [deasync](https://github.com/abbr/deasync) bodge-enabler for doing crazy requirejs shit
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
