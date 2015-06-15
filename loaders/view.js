define(function(){
	/* builder function that creates a client side view interface */
	function view(config){
		return {
			dom : {},
			$ : function(selecta){
				return this.dom.find(selecta);
			},
			render : function(selecta, options){
				this.dom = $(config.html);
				$(selecta).html(this.dom);
				config.init.call(this, options);
			}
		}

	}
	return {
		load : function(name, req, onload, config, isBuild){
			req([name], function(mod){ //require the view definition
				onload(isBuild?null:view(mod));
			})
		}
	}
});