# Confuguration

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
 - `collection` mongo collection (defaults to name)
 - `access` **access module**: default access controls for entire model
 - `properties` : **object of properties**
 
example definition:
~~~ javascript
define({
	name : 'things',
	properties : {
		name : {} //TODO
	}
})
~~~


# API

## views
 - `view.render(selecta, options)` render the view into a parent passing arbitrarty options
   - `selecta` jquery selector for view to be insetered into
   - `options` object that is passed to the view's init function
 - `view.$(selecta)` selects with jquery within the view



# Included Requirejs loaders/plugins

## css
load, parse, minify and parse css/less for use in views (or whatever you're into). depends on [require-less](https://github.com/guybedford/require-less)

## compat
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

## model
require and parse a model, works contextually

## view
require and build a view object

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
 