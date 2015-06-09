define(['jquery'], function($){
	return function(config){
		return {
			render : function(selecta){
				$(selecta).html(config.html);
			}
		}
	};
});