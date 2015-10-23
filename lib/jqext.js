$.fn._ = function(prop){
    var el = $(this);
    var view = el.data('view');
    if(view) view.dom = el;
    return prop?view[prop]:view;
}