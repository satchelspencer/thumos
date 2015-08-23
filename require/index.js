/* lil' helper to get a set */
define(['container'], function(container){
	return function(setname){
		var set = container.sets[setname];
		/* if in the server */
		if(container.thumos) set = set(container.thumos); //init it with the sconfig
		return set;
	}
});