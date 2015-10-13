define(function(html, templates){
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    templates.forEach(function(template){
        tmp.replaceChild(template[0]().render(), document.getElementById(template[1]));
    });
    return tmp.childNodes;
})