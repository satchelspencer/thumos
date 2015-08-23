/* lil' helper to get a set */
define(['./allsets'], function(allsets){
	return function(setname){
		return allsets[setname];
	}
});