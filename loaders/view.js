define(function(){
	/* builder function that creates a client side view interface */
	function view(config){
		var api = {
			dom : {},
			$ : function(selecta){
				return this.dom.find(selecta);
			},
			render : function(options){
				/* first parse our html to find child views to insert */
				var toInsert = [];
				var html = config.html.replace(/\<#(.*)\>/g, function(match, tag){
					if(config.insert[tag]){
						toInsert.push(tag);
						/* add a temporary element to the dom to be later replaced */
						return "<div id='insert"+tag+"'></div>";
					}else return ''; //unknown tag. move on with your life
				});
				var dom = $(html); //build our jquery
				/* replace all the temporart elements with our rendered child views */
				toInsert.forEach(function(tag){
					var idom = config.insert[tag].render?config.insert[tag].render():config.insert[tag]; //render it with no config if it is view otherwise insert the dom
					dom.find('#insert'+tag).replaceWith(idom);
				});
				this.dom = dom;
				/* now initalize our view since its children are done */
				config.init.call(this, options);
				return dom;
			},
			fn : {},
			events : {},
			/* event registering on views */
			on : function(event, callback){
				api.events[event] = api.events[event]||[];
				api.events[event].push(callback);
			},
			off : function(event){
				delete api.events[event];
			},
			trigger : function(event, value){
				if(api.events[event]) api.events[event].forEach(function(callback){
					callback(value);
				});
			}	
		};
		function proxy(fnName){
			return function(){
				return config.fn[fnName].apply(api, arguments);
			}
		}
		/* setup or custom functions */
		if(config && config.fn) for(var fnName in config.fn){
			api.fn[fnName] = proxy(fnName);
		}
		return api;

	}
	return {
		load : function(name, req, onload, config, isBuild){
			req([name+'/index'], function(mod){ //require the view definition
				onload(isBuild?null:view(mod));
			})
		}
	}
});
