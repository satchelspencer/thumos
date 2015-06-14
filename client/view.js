define(['jquery'], function($){
	return function(config){
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
	};
});