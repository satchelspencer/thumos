# Thumos
it does some serious shit
 - [`configuration`](#configuration)
   - [`views`](#creating-views)
   - [`models`](#creating-models)
   - [`set`](#creating-sets)
   - [`access`](#access-modules)
   - [`queries`](#queries)
 - [`api`](#api)
   - [`views`](#view-api)
   - [`models`](#model-api)
   - [`sets`](#set-api)
 - [`loaders`](#included-loaders)
   - [`css`](#css-loader)
   - [`compat`](#compat-loader)
   - [`view`](#view-loader)
   - [`set`](#set-loader)
 - [`plugins`](#plugins)
 - [`dependencies`](#included-dependencies)
   
# Configuration

## thumos.init(options)
setup a new thumos build given options:
  - `mongo` db info with auth if needed. see [mongo connection strings](http://docs.mongodb.org/manual/reference/connection-string/)
  - `buildpath` **path**: destination for the build files (should be accessible by static webserver)
  - `uglify` **boolean**: controls minification of source files (default false)
  - `models` **array**: of paths to thumos models
  - `pages` **array**: of objects specifying build pages:
    - `title` title for page
    - `view` **path**: of thumos view modules
    - `url` **path**: of page destination relative to website root
  - `paths` **object**: see http://requirejs.org/docs/api.html#config-paths
  - `ext` **object**: paths for external libraries (not to be included in build)
  - `shim` **object**: see http://requirejs.org/docs/api.html#config-shim
  - `html` **path**: to default html template to build pages from
  - `app` **express app**: express app to build model routes on
  - `route` : base route for thumos (defaults to '/')
  - `auth` : [authentication plugin](#authentication)
  - `plugins` **array**: of [plugins](#plugins)
  
example setup:
~~~
- app
 - main.js
 - sets
  - things.js
 - views
  - home
 - ext
  - jquery-cookie.js
 - build
~~~

main.js
~~~ javascript
var express = require('express');
var thumos = require('thumos');

var app = express();

thumos.init({
  mongo : 'myapp',
  buildpath : 'build',
  uglify : false,
	sets : [
		'sets/things',
	],
	pages : [
		{
			title : 'My Thing',
			view : 'views/home',
			url : '/'
		}
	],
	ext : {
		'jquery' : 'https://code.jquery.com/jquery-1.11.1.min'
	},
	shim : {
		'ext/jquery-cookie' : {
    		deps : ['jquery'],
    		exports : 'jQuery.fn.cookie'
    	}
	},
	auth : thumos.auth(),
	app : app
});
~~~

## creating views
view objects have the following properties:
  - `html`: dom to be inserted at render
  - `init(options)` **fn**: init callback. `this` contains view api

example definition:
~~~ javascript
define([
	'text!./index.html', //html dep
	'model!models/contacts'
	'css!./index', //css dep
], function(template, contacts){  
	return {
		hmtl : template,
		init : function(options){
			
		}
	};
})
~~~

## creating models
model definitions have the following properties:
 - `name` model name (url friendly)
 - `properties` : object of properties, or [validator](#property-validators). properties can simply be a model or be defined as so:
   - `valid` : [validator function](#property-validators) that calls back with validity of property
   - `listed` : bool if model should be included in list
 - `functions` : object of custom functions
 
example definition:
~~~ javascript
define({
	name : 'things',
	properties : {
		name : {} //TODO
	}
})
~~~

## creating sets
sets are a queryable, updateable collection of multiple models. they sync with the client and the server.
 - `name` set name (usually plural of model name) used in url routing
 - `path` path to be passed to express (must start with `/`) defaults to `/name`
 - `collection` mongo collection (defaults to `name`)
 - `model` model to use
 - `access` [access module](#access-module) default access controls for entire set
 - `get` query to run on startup, defaults to select all
 - `queries` object of set [queries](#queries)
 - `functions` object of custom functions that act on multiple models in a set
 
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
 - `init` : `function(set, app, callback)` setup any routes you will need
 - `verify` : `function(req, callback)` [express](http://expressjs.com/) middleware. MUST set req.thumos to
 
 ~~~javascript
 {
 	user : 'some unique id/access token'
 	/* add anything else you want */
 }
 ~~~

thumos by default sets up an email/password based authentication mechanism. cookie based sessions based on [this paper](http://www.cse.msu.edu/~alexliu/publications/Cookie/cookie.pdf). It takes the following options:
 - userset
 - memcached

# API

## view api
- `view.render(selecta, options)` render the view into a parent passing arbitrary options
  - `selecta` jquery selector for view to be inserted into
  - `options` object that is passed to the view's init function
- `view.$(selecta)` selects with jquery within the view
- `view.dom` jquery object of view

## model api
- `model.get(props, callback)` get value of property in model, calls back with object of prop/value pairs
- `model.set(values, callback)` set props with object of prop:value pairs, calls back with success
- `model.del()` destroy model
- `model.on(event, callback)` binds callback to event
  - `change`
  - `remove`
- `model.off(event)` removes callback from event:
- `model.trigger(event)` triggers event in model
- `model.fn` object of available custom functions 

## set api
- `set.get(ids, callback)` retrieves models by id, calls back with [resultset](#resultset-api)
- `set.del(ids, callback)` removes models by id
- `set.add(data, callback)` adds array of model data, calls back with added [resultset](#resultset-api)
- `set.query(query, params, callback)` query a set, callback with [resultset](#resultset-api)
- `set.on(event, callback)` binds to entire set. events:
  - `change`
  - `add`
  - `remove`
- `set.off(event)` removes event from set
- `set.trigger(event)` trigger event in set
- `set.fn` object of available custom functions 

## resultset api
a list of multiple models. a call to the [model api](#model-api) simply makes that call for each model in the resultset
iterable via underscore like backbone?

# Included Loaders
requirejs loaders/plugins

## css loader
load, parse, minify and parse css/less for use in views (or whatever you're into). depends on [require-less](https://github.com/guybedford/require-less)

## compat loader
create a requirejs module with variations for client and server. contexts expects an object with keys:
 - `client` whatever your client module should be
 - `server` i bet you can guess

usage (making the module):
~~~ javascript
define({
	client : function(){
		return 'i'm on the client'
	},
	server : function(){
		return 'server side'
	}
})
~~~

using the module:
~~~javascript
define(['compat!test'], function(test){
	console.log(test()) //returns "i'm on the client" or "server side"
});
~~~

## view loader
require and build a view object

## set loader
require a set from its definition

# Plugins
thumos plugins also can do some serious shit, mostly for the backend. Take for example the file plugin that intercepts any properties in sets that have `file : true`. setting that property now requires a [file object](https://developer.mozilla.org/en-US/docs/Web/API/File) 

# Included Dependencies
 - [express](http://expressjs.com/) server side routing goodness
 - [mongojs](https://github.com/mafintosh/mongojs) mongo api in node
 - [requirejs](http://requirejs.org/) core of loading/build
   - [requirejs-text](https://github.com/requirejs/text) load text/html
   - [require-less](https://github.com/guybedford/require-less) require css/less and build
     - [csso](https://github.com/css/csso) css optimizer/minifier
     - [less](http://lesscss.org/) less parser
   - [deasync](https://github.com/abbr/deasync) bodge-enabler for doing crazy requirejs shit
 - [jquery](https://jquery.com/) client side dom management
 - [async] (https://github.com/caolan/async) async control flow
 - [postcss](https://github.com/postcss/postcss) css processor	
 - [autoprefixer](https://github.com/postcss/autoprefixer) handles browser prefixes at build time
 - [rimraf](https://github.com/isaacs/rimraf) rm -rf
 - [cheerio](https://github.com/cheeriojs/cheerio) server side dom management
 
