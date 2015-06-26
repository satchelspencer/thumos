define(function(set, ids){
	function doEach(fn){
		return function(){
			var args = arguments;
			
		}
	}
	return {
		get : function(props, callback){
			ids.forEach(function(id){
				set.as(id).get(props, callback);
			});
		},
		set : 
	}
});