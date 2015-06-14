# Confuguration

## thumos.config(options)
setup a new thumos build given options:
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

thumos.config({
  buildpath : 'build',
  uglify : false,
	models : [
		'models/things',
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

## thumos.view(options)
create a new view given config options:
  - `html`: dom to be inserted at render
  - `init(options)` **fn**: init callback. `this` contains view api

example usage:
~~~ javascript
define([
	'view',
	'text!./index.html',
	'css!./index'
], function(view, template){  
	return view({
		hmtl : template,
		init : function(options){
		
		}
	});
})
~~~

## thumos.model(options, properties)
create a new model definition. options:
 - `collection` mongo collection
 - `access` **access module**: default access controls for entire model
 
properties is an object of the format:

## thumos.compat(contexts)
create a requirejs module with variations for client and server. contexts expects an object with keys:
 - `client` whatever your client module should be
 - `server` i bet you can guess

usage (making the module):

~~~ javascript
define(['compat'], function(compat){
	return compat({
		client : function(){
			return 'i'm on the client'
		},
		server : function(){
			return 'server side'
		}
	});
})
~~~

# API

# Inclusions
