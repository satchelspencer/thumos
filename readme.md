# Thumos
it does some serious shit
 - [`configuration`](#configuration)
   - [`views`](#creating-views)
   - [`models`](#creating-models)
   - [`set`](#creating-sets)
 - [`api`](#api)
   - [`views`](#view-api)
   - [`models`](#model-api)
   - [`sets`](#set-api)
 - [`loaders`](#included-loaders)
   - [`css`](#css-loader)
   - [`compat`](#compat-loader)
   - [`view`](#view-loader)
   - [`model`](#model-loader)
   - [`set`](#set-loader)
 - [`dependencies`](#included-dependencies)
   
# Configuration

## thumos(options)
setup a new thumos build given options:
  - `mongo` **object**: database information
  	- `db` db name
  	- `host` server (optional)
  	- `user` mongo user (optional)
  	- `password` mongo pass (optional)
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
  - `express` **express app**: express app to build model routes on
  
example setup:
~~~
- app
 - main.js
 - models
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

thumos({
  mongo : {
  	db : 'myapp'
  },
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
	express : app
});
~~~

## creating views
view objects have the following properties:
  - `html`: dom to be inserted at render
  - `init(options)` **fn**: init callback. `this` contains view api

example definition:
~~~ javascript
define([
	'view',
	'text!./index.html', //html dep
	'css!./index', //css dep
	'model!models/contacts'
], function(view, template, contacts){  
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
 - `properties` : object of properties. properties can simply be a model or be defined as so:
   - `valid` : function that calls back with validity of property
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
 - `collection` mongo collection (defaults to name)
 - `model` model to use
 - `access` **access module**: default access controls for entire set
 - `functions` object of custom functions that act on multiple models in a set
 - `queries` object of set queries

sets create the following routes on setup:
 - `/set/` (get) get list of models in set (default query)
 - `/set/query/query_name` (post)
   - `query`
 - 

# API

## view api
- `view.render(selecta, options)` render the view into a parent passing arbitrary options
  - `selecta` jquery selector for view to be inserted into
  - `options` object that is passed to the view's init function
- `view.$(selecta)` selects with jquery within the view
- `view.dom` jquery object of view

## model api
- `model.get(prop, callback)` get value of property in model
- `model.set(prop, value, callback)` set value of prop
- `model.del()` destroy model
- `model.on(event, callback)` binds callback to event
- `model.off(event)` removes callback from event:
  - `change`
  - `remove`
- `model.trigger(event)` triggers event in model
- `model.fn` object of available custom functions 

## set api
- `set.get(id, callback)` retrieves model by id, callsback with model
- `set.del(id, callback)` removes model by id
- `set.on(event, callback)` binds to entire set. events:
  - `change`
  - `add`
  - `remove`
- `set.off(event)` removes event from set
- `set.trigger(event)` trigger event in set
- `set.query(query, callback)` query a set, callback with result
- `set.fn` object of available custom functions 

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

# Included Dependencies
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
 
