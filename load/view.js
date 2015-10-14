define({
    normalize : function(path){
        var p = nodeRequire('path');
        return path.match("\.js$")?path:p.join(path, p.basename(path)+'.js');
    },
	init : browser(function(config){
		return function(){
            var $ = require('jquery');
            var _ = require('underscore');
			
			var events = {};
			var api = {
				dom : {},
				$ : function(selecta){
					return this.dom.find(selecta);
				},
				render : function(options, className){
				    if(_.isFunction(config.html)) config.html = config.html();
					var dom = $(config.html).clone(); //build our jquery
					this.dom = dom;
					/* now initalize our view since its children are done */
					if(config.init) config.init.call(this, options);
					dom.data('view', _.omit(this, 'dom', 'render'));
					if(className) this.addClass(className);
					return dom;
				},
				/* event registering on views */
				on : function(event, callback){
					events[event] = callback;
				},
				off : function(event){
					delete events[event];
				},
				trigger : function(event, value){
					if(events[event]) events[event](value);
				}	
			};
			function proxy(fnName){
				return function(){
					return config.fn[fnName].apply(api, arguments);
				}
			}
			/* setup or custom functions */
			if(config && config.fn) for(var fnName in config.fn){
				if(!api[fnName]) api[fnName] = proxy(fnName);
				else throw "tried to overwrite view prop: "+fnName;
			}
			return api;
		}
	})
});