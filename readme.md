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
 - `access` [access module](#access-module) default access controls for entire set
 - `queries` object of set [queries](#queries)
 - `functions` object of custom functions that act on multiple models in a set

## custom property types
property types are npm modules that likely will do a mix of client and server tasks. as a result they must be npm modules installed in your main project. they can can have commonjs dependencies, but must be written in amd format returning an object of the following format see [thumos-file](https://github.com/satchelspencer/thumos-file) for an example: 
 - `encode : function(inp, callback)` takes input, which may contain raw or decoded if data. validate and return encoded format
 - `decode : function(inp, callback)` function to take stored data and return whatever you need
 - `server : function(config, callback)` takes in main thumos config for setup, and callback function to be called with:
   - `finalize : function(value, callback)` given value calls back with final value to be stored
   - `purge : function(value, callback)` 'destructor' for the type, removes a value

if you don't need a server side setup you can omit the init function and require like any other module, or inline it. **idgaf**
 
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

## resultset api
currently it is just an array of models

## events
these events are called when certain api actions occur. your events don't have to be these
 - `change` when a model changes from its previous value
 - `add` when a new model is added to the set
 - `del` when a model is removed

# Included Loaders
todo

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
 - [async] (https://github.com/caolan/async) async control flow
 - [postcss](https://github.com/postcss/postcss) css processor	
 - [autoprefixer](https://github.com/postcss/autoprefixer) handles browser prefixes at build time
 - [rimraf](https://github.com/isaacs/rimraf) rm -rf
 - [cheerio](https://github.com/cheeriojs/cheerio) server side dom management
 - [node-memcached](https://github.com/3rd-Eden/memcached) memcached for node
 - [bcrypt](https://github.com/ncb000gt/node.bcrypt.js) password hash
 - [crc-32](https://github.com/SheetJS/js-crc32) crc32 checksumming for detecting when to fire `change` events
