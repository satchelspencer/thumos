/* used in build, load the defined init view, and render it in page body */
define(['view!init'], function(init){
	init.render('body');
});