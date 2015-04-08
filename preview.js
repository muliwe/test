var express = require('express')
, app     = express()
, mysql   = require('mysql')
, ipfilter = require('ipfilter')
, fs = require('fs')
, https = require('https')
, moment  = require('moment')
, Iconv  = require('iconv').Iconv
, Buffer = require('buffer').Buffer
, jade = require('jade')
, config = {
	host: 'https://editor.ruscur.ru',
	port: 3008,
	ips: ['127.0.0.1','213.133.122.12','46.188.3.213'],
    rejectconnectedhttps: 100,
    timeout: 30000,
	maxthemes: 10,
	maxnews: 21,
	maxnewsintheme: 4,
	keywordcut: 0.1,
	themecut: 20,
	newscut: 10,
	jade: {
		main: 'jade/main.jade'
		}
	}
, mysqlparams = {
  host     : 'localhost',//'127.0.0.1'
  user     : 'ruscur',
  password : '^8Da1ru6',
  database : 'ruscur'
  }
;

app.use(ipfilter(config['ips'], {mode: 'allow'}));

var httpsoptions = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem'),
  agent: new https.Agent({maxSockets:config['rejectconnectedhttps']})
  }
, httpsserver = https.createServer(httpsoptions,app)
, now = new Date()
, currdate = moment(now)//.subtract(24, 'hours') // force to reload node cache ones
, currdate2 = moment(now)//.subtract(10, 'minutes') // force to reload news cache ones
, newsgraph = new Newsgraph()
, iconv = new Iconv('CP1251','UTF-8//TRANSLIT//IGNORE')
;

newsgraph.Update();

app.get('/', function (req, res) {

  var echo = 'Not working'
  , flush = (req.query.flush?true:false)
  , newsflush = (req.query.newsflush?true:false)
  , id = (req.query.id?parseInt(req.query.id,10):0)
  , now2 = new Date()
  , currdate3 = moment(now2)
  , currdate4 = moment(now2).subtract(24, 'hours')
  , currdate5 = moment(now2).subtract(10, 'minutes')
  , isbefore = currdate.isBefore(currdate4) // cache is older then 24 hours
  , isbefore2 = currdate2.isBefore(currdate5) // cache is older then 10 minutes
  ;

  echo = 'Last news graph status: '+newsgraph.GetStatus()+ '\nRubs cache date: '+currdate.format("D/MM HH:mm:ss")+ '\nNews cache date: '+currdate2.format("D/MM HH:mm:ss");

  if (isbefore || flush) {
	newsgraph.Update();  
	currdate = currdate3;
	currdate2 = currdate3;
  } else if (isbefore2 || newsflush) {
	newsgraph.NewsUpdate();  
	currdate2 = currdate3;
  }
 
  res.end(echo);

});

app.get('/themes', function (req, res) {

  var echo = "[1,'Server is busy']"
  , noids = (req.query.not?req.query.not.split('|'):[])
  , id = (req.query.id?parseInt(req.query.id,10):0)
  , base = (req.query.base?parseInt(req.query.base,10):0)
  , num = (req.query.page?parseInt(req.query.page,10):1)
  , dohtml = (req.query.html?true:false)
  , themes = []
  , disctime = setTimeout(function(){

	clearInterval(disctime2);
	res.end(reconvert(echo));

  }, config['timeout']) // disconnect timeout
  ;
  
  id = (id>0?id:0);
  noids = newsgraph.Keyz(noids,base > 0);
  if (base > 0) for (k in noids) noids[k] = base - noids[k];
  
  if (dohtml)
  res.writeHead(200, {"Content-Type": "text/html; charset=utf-8"}); 
  else 
  res.writeHead(200, {"Content-Type": "application/json; charset=utf-8"}); 

  if (!newsgraph.updating) { // on the go

	var themes = newsgraph.GetThemes(id,num,noids);
	if (themes.length > 1) { echo = newsgraph.GetEcho(themes,noids,dohtml); } else { echo = ( dohtml ? '<!-- the end is nigh -->' : "[4,'Themes not found']") }
	clearTimeout(disctime);
	res.end(reconvert(echo));

  } else { // on the go
  
  var disctime2 = setInterval(function() {
	  
    if (!newsgraph.updating) {
    clearInterval(disctime2);

	var themes = newsgraph.GetThemes(id,num,noids);
	if (themes.length > 1) { echo = newsgraph.GetEcho(themes,noids,dohtml); } else { echo = ( dohtml ? '<!-- the end is nigh -->' : "[4,'Themes not found']") }
	clearTimeout(disctime);
	res.end(reconvert(echo));

	}
  }, config['timeout']/100); // tick interval
  
  }
 });

httpsserver.listen(config['port'], function(){
  console.log('Started stats on '+config['host']+':'+config['port']+' - localhost only, connections restricted to '+config['rejectconnectedhttps']);
});

// end of code

function Newsgraph() {

    this.nodes = {};
    this.themes = {};
    this.news = {};
	
    this.laststatus = 'Graph is created';
	this.updating = false;
	
	this.Keyz = function(arr,hex) {
	var result = [];
	
	if (arr.constructor === Array)
		{	for (k in arr) { var l = parseInt(arr[k],(hex?16:10)); if (!!l && l > 0) result.push(l); }	}
	else
	Object.keys(arr).forEach(function(k, index, array){ var l = parseInt(k,(hex?16:10)); if (!!l && l > 0) result.push(l); });
		
	return result;
	}
	
    this.GetEcho = function (result, noids, dohtml) {
		
	var echo = ''
	, obj = this
	;
		
	if (dohtml) {
		var maxid = 0
		, newnoids = []
		;

		for (var is in result) {
			if (is > 0 && result[is].response.filled) {
				noids.push(result[is].id);
				echo += "\n\n" + result[is].response.rendered;
			}
		}

		for (var is in noids) if (noids[is] > maxid) maxid = noids[is];
		maxid++; // base is at least bigger than maximum id to prevent zeroes
		for (var is in noids) newnoids.push((maxid - noids[is]).toString(16));
		echo += "\n\n<div class='diff_indent2 loadit' url='id=0&base="+maxid+"&not="+newnoids.join('|')+"'></div>";

		} else 
		echo = JSON.stringify(result);	
		
	return echo;
	}

    this.Filternoids = function() {
	
	var id = arguments[0]
	, themes = (id> 0 && this.nodes.hasOwnProperty(id) ? this.Keyz(this.nodes[id].themes) : this.Keyz(this.themes))
	, result = {}
	, resultarr = []
	;

//	console.log(themes);
	for (p in themes) result[themes[p]] = true; // unique filter
	
	for (var i=1; i<arguments.length; i++) {
		if (arguments[i].constructor === Array) for (p in arguments[i]) delete result[arguments[i][p]]; // arguments filter
		else if (typeof arguments[i] === 'number') delete result[arguments[i]];
	}

	this.Keyz(result).forEach(function(k, index, array){ resultarr.push(k); });
	
	return resultarr;
	}
	
    this.GetThemes = function (id, num, noids) {
		
	var disctime = setTimeout(function(){
			return [2,'Server timed out'];
			}, config['timeout'])
	, obj = this
	, result = [0] // no error
	;
	
	id = parseInt(id,10);
	for (var is in noids) {
		noids[is] = parseInt(noids[is],10);
	}
	
	if (id > 0) {
		if (!obj.nodes.hasOwnProperty(id) || obj.nodes[id].type == 0)
			return [3,'Wrong or invisible node '+id];
			
		obj.GetThemesInner(id, num, noids, result); // rub or keyword themes
	} else if (id == 0 && noids.length == 1) // relative themes to one theme
	{
		if (!obj.themes.hasOwnProperty(noids[0]) || obj.themes[noids[0]].type == 0)
			return [5,'Wrong or invisible theme '+noids[0]];

		var toprubs = obj.themes[noids[0]].parents.sort(function(a,b){ return obj.nodes[b].weightpath>obj.nodes[a].weightpath?1:-1; }); // sorted with long-hand weight priority, replace .weightpath with .weight for short-hand sort
		
		obj.GetThemesInner(toprubs[0], num, noids, result); // most weighted parent themes
	} else {

	obj.GetThemesInner(0, num, noids, result); // root node / FP setup list
	}

	var parsedresult = obj.ParseResult(result,num);
	
	return parsedresult;
	}

    this.GetThemesInner = function (id, num, noids, result) {
	var obj = this
	, type = (id > 0 ? obj.nodes[id].type : 0)
	, topthemes = []
	;
	
	num = (num > 0 ? num : 1);
	
	if (result.length > config['maxthemes']*num) return;

	topthemes = obj.Filternoids((id>0?id:0), noids, result).sort(function(a,b){ return (obj.themes[b].ci > obj.themes[a].ci || (obj.themes[b].ci == obj.themes[a].ci && obj.themes[b].weight > obj.themes[a].weight)?1:-1); });
		
	var maxweight = (topthemes.length > 0 ? obj.themes[topthemes[0]].weight : 1); // constituency for empty set
		
	for (var is in topthemes) {
		if (result.length > config['maxthemes']*num) break;
		if (id > 0 && obj.themes[topthemes[is]].weight < maxweight / config['themecut']) break;
			
		result.push(topthemes[is]);
	}
		
	if (result.length > config['maxthemes']*num) return;
		
	if ( id > 0 ) {
		if (obj.nodes[id].parent > 0 && obj.nodes[obj.nodes[id].parent].type > 0) obj.GetThemesInner(obj.nodes[id].parent, num, noids, result);
		if (obj.nodes[id].parent == 0) obj.GetThemesInner(0, num, noids, result);
	} // else we touched the bottom, giving up
		
	return;
	}
	
    this.ParseResult = function (result, num) {
	var obj = this
	, realresult = []
	, realresultnum = 0
	;

	realresult.push(result[0]);
	
	for (var is in result) {
		if (obj.themes.hasOwnProperty(result[is]) && obj.themes[result[is]].type > 0 && obj.themes[result[is]].news.length > 0) {
			var theme = obj.themes[result[is]];
			
		    if (!theme.response.hasOwnProperty('filled') || !theme.response.filled) // use result cache || fill it below
				{
					theme.response.news=[];
					theme.response.url = (theme.url != '' ? '/t/'+gettitleurl(theme.url)+'/'+geturl(result[is])+'.shtml' : '/themes/'+geturl(result[is])+'.shtml');
					
					var topnews = obj.Keyz(theme.news).sort(function(a,b){ return (obj.news[b].weight > obj.news[a].weight?1:-1); })
					, maxweight = obj.news[topnews[0]].weight
					;
					
					for (var it in topnews) {
						if (obj.news[topnews[it]].weight < maxweight / config['newscut']) break;
						if (it == config['maxnewsintheme']) break;
			
						theme.response.news.push(topnews[it]);
					}

					theme.response.rendered = jade.renderFile(config.jade['main'],{theme:theme});
					theme.response.filled = true;
				}
			
			if (obj.themes[result[is]].response.hasOwnProperty('news')) realresultnum += theme.response.news.length;
			
			if (num == 0 || (is > config['maxthemes']*(num-1) && is < config['maxthemes']*num+1)) realresult.push(theme); // show only numth page or first maxnews news if num is set to zero
			if (num == 0 && realresultnum > config['maxthemes']) break;
		}
	}
		
	return realresult;
	}
	
    this.Update = function () {
		  
	  if (!this.updating) {
		this.updating = true;
        this.laststatus = 'Graph is updating';
		
//        console.log('Graph is updating');

		var connection = mysql.createConnection(mysqlparams);
		var obj = this;
		
		connection.query("SELECT id, parent, title, type FROM ruscurrubs WHERE vis > 0 and (type = 1 or type = 2) order by id asc", [], function(err, rows, fields) { 
		if (err) {
			obj.laststatus = 'Graph updating error: '+ err;
			obj.updating = false;
			connection.end();
		} else 
			{
//			console.log('Select get: '+rows.length);

			obj.Keyz(obj.nodes).forEach(function(k, index, array){
				obj.nodes[k].type = 0; // hide old nodes
				obj.nodes[k].path = [k]; // clear old paths
				obj.nodes[k].children = []; // clear old children
			});
			for (var is in rows) {
				var id = rows[is].id;
				if (!obj.nodes.hasOwnProperty(id)) obj.nodes[id] = new Newsnode(id);
				obj.nodes[id].parent = rows[is].parent;
				obj.nodes[id].title = rows[is].title;
				obj.nodes[id].type = rows[is].type;
			}
			for (var is in rows) {
				obj.nodes[rows[is].id].Getpath(obj,true); // use cache
			}
			obj.Keyz(obj.nodes).forEach(function(k, index, array){
//				console.log(obj.nodes[k]);
				if (obj.nodes[k].type == 1 && obj.nodes[k].path.length > 0) {
					for (var rub in obj.nodes[k].path) obj.nodes[obj.nodes[k].path[rub]].children.push(k); // fill children for nodes
				}
			});
			
			obj.laststatus = 'Graph is updated';
//			console.log('Graph is updated');
			obj.updating = false;
			connection.end();

			obj.NewsUpdate();
			}
		});
	  }
    }
	
    this.NewsUpdate = function () {

	  var now = new Date()
	  , fromdate = parseInt(''+moment(now).subtract(100, 'days').format("YYYYMMDDHHmmss"),10) //31
	  , nowdate = moment(now)
	  ;

	  if (!this.updating) {
		this.updating = true;
        this.laststatus = 'Graph is updating news';
		
		var connection = mysql.createConnection(mysqlparams);
		var obj = this;
		
		this.themes = {}; // drop themes cache
		this.news = {}; // drop news cache
		obj.Keyz(obj.nodes).forEach(function(k, index, array){ obj.nodes[k].themes=[]; }) // drop themes connected to node cache
//		obj.themes[0] = new Newstheme(0); obj.themes[0].type = 0; // we can create root node for consistency
		connection.query("select t.id as id, b.id as bid, t.pd as tpd, b.pd as bpd, t.type, b.body, b.genbody, t.title as tt, t.image as ti, t.anons as ta, b.image as bi, b.anons as ba, t.ci, t.url "+
		"from ruscurthemes as t join ruscurbricks as b on b.themeid = t.id and b.type = 1 and b.vis = 2 where t.type > 0 and t.type <> 4 and b.pd > ?", [fromdate], function(err, rows, fields) { 
		if (err) {
			obj.laststatus = 'News updating error: '+ err;
			obj.updating = false;
			connection.end();
		} else 
			{
//			console.log('Select get: '+rows.length);

			for (var is in rows) {
				var tid = rows[is].id
				, bid = rows[is].bid;

				if (!obj.themes.hasOwnProperty(tid)) { // prevent unnecessary recreation
				obj.themes[tid] = new Newstheme(tid);
				obj.themes[tid].title = rows[is].tt;
				obj.themes[tid].anons = rows[is].ta;
				obj.themes[tid].image = rows[is].ti;
				obj.themes[tid].pd = moment(rows[is].tpd,"YYYYMMDDHHmmss");
				obj.themes[tid].type = rows[is].type;
				obj.themes[tid].ci = rows[is].ci;
				obj.themes[tid].url = rows[is].url;
				}
				
				obj.news[bid] = new Newstitle(tid, bid);
				obj.news[bid].title = (rows[is].body.match(/title==/)?rows[is].body.match(/title==(.*?)(?:\&\&|$)/)[1]:obj.news[bid].title);
				obj.news[bid].anons = rows[is].ba;
				obj.news[bid].body = rows[is].genbody;
				obj.news[bid].image = rows[is].bi;
				obj.news[bid].pd = moment(rows[is].bpd,"YYYYMMDDHHmmss");
				obj.news[bid].age = nowdate.diff(obj.news[bid].pd, 'hours');
				var temptype = (rows[is].body.match(/subtype==(\d+?)/g)?parseInt(rows[is].body.match(/subtype==(\d+?)/g)[0],10):false);
				obj.news[bid].type = (temptype && !isNaN(temptype)?temptype:obj.news[bid].type);
			}
			
			obj.Keyz(obj.news).forEach(function(k, index, array){
				var incr = (obj.themes[obj.news[k].theme].type == 3 ? 1.5 : 2) // breaking news are decrementing faster
				obj.news[k].weight = parseInt((1 << parseInt((obj.themes[obj.news[k].theme].type-1),10))*obj.news[k].type * 12*incr/(12*incr+obj.news[k].age)*100 ,10)/100; // (N-1)**2 * L * 24/(24 + H) // keep 2 digits after point

				obj.themes[obj.news[k].theme].news.push(k);
				obj.themes[obj.news[k].theme].weight = parseInt((obj.themes[obj.news[k].theme].weight + obj.news[k].weight)*100 ,10)/100; // keep 2 digits after point;
			});

			obj.laststatus = 'Graph news are updated';

			obj.updating = false;
			connection.end();

			obj.LinksUpdate();
			}
		});
	  }
    }

    this.LinksUpdate = function () {

	  if (!this.updating) {
		this.updating = true;
        this.laststatus = 'Graph is updating links and paths';
		
		var connection = mysql.createConnection(mysqlparams);
		var obj = this;
		
		var ids = [];

		obj.Keyz(obj.news).forEach(function(k, index, array){
			obj.news[k].keywords = []; // drop keyword cache
			ids.push(k);
			});
		obj.Keyz(obj.themes).forEach(function(k, index, array){
			obj.themes[k].parents = []; // drop rubs cache
			obj.themes[k].keywords = []; // drop keyword cache
			ids.push(k);
			});
		obj.Keyz(obj.nodes).forEach(function(k, index, array){ // drop weight
			obj.nodes[k].weight = 0; 
			obj.nodes[k].weightpath = 0; 
			});

		connection.query("select toid, fromid, rw.type from ruscurrublinks join ruscurrubs as rw on toid = rw.id and rw.vis > 0 and (rw.type = 1 or rw.type = 2) where fromid = "+ids.join(' or fromid = '),[], function(err, rows, fields) { 
		if (err) {
			obj.laststatus = 'Links updating error: '+ err;
			obj.updating = false;
			connection.end();
		} else 
			{
//			console.log('Select get: '+rows.length);
			
			for (var is in rows) {
				var id = rows[is].fromid
				, toid = rows[is].toid
				;
			
				if (rows[is].type == 2) { // keyword-news pair
					if (obj.news.hasOwnProperty(id) && obj.nodes.hasOwnProperty(toid)) {

						obj.news[id].keywords.push(toid); // to news themselves
						obj.themes[obj.news[id].theme].keywords.push(toid); // to parent theme, no matters doubles
						obj.nodes[toid].themes.push(obj.news[id].theme); // to keyword
						if (obj.nodes.hasOwnProperty(obj.nodes[toid].parent) && obj.news[id].weight > config['keywordcut']) obj.nodes[obj.nodes[toid].parent].themes.push(obj.news[id].theme); // to parent node (except root node), but not for parent node path
						for (var rub in obj.nodes[toid].path) obj.nodes[obj.nodes[toid].path[rub]].weight = parseInt((obj.nodes[obj.nodes[toid].path[rub]].weight + obj.news[id].weight / 2)*100 ,10)/100; // keep 2 digits after point
						}
				} else { // theme-rub pair
					if (obj.themes.hasOwnProperty(id) && obj.nodes.hasOwnProperty(toid)) {
						obj.themes[id].parents.push(toid);
						obj.nodes[toid].themes.push(id);
						for (var rub in obj.nodes[toid].path) {
							obj.nodes[obj.nodes[toid].path[rub]].themes.push(id); // to the whole path
							obj.nodes[obj.nodes[toid].path[rub]].weight = parseInt((obj.nodes[obj.nodes[toid].path[rub]].weight + obj.themes[id].weight)*100 ,10)/100; // keep 2 digits after point
							}
					}
				}
			}
			
			obj.Keyz(obj.nodes).forEach(function(k, index, array){
				for (var rub in obj.nodes[k].path) {
					obj.nodes[k].weightpath += obj.nodes[obj.nodes[k].path[rub]].weight; // recount cumulative path
				}
			});
			
			
			obj.laststatus = 'Graph links and paths are updated';

			obj.updating = false;
			connection.end();

			}
		});
	  }
    }

    this.GetStatus = function () {
        return this.laststatus
    }
}

function Newsnode (id) {

    this.id = id;
    this.parent = 0;
    this.title = 'Node '+id;
    this.type = 1;
    this.weight = 0;
    this.weightpath = 0;
	this.path = [id];
	this.children = [];
	this.themes = [];

    this.Getpath = function (obj,force) {
//		console.log(this);
		if (!this.id) return [0];
	
		if (force && ((this.parent == 0 && this.path.length == 1) || (this.parent > 0 && this.path.length > 1))) return this.path; // return cached path
	   
		if (this.parent == 0 || !obj.nodes.hasOwnProperty(this.parent) || obj.nodes[this.parent].type == 0) { // clear broken parent link - place to root
			this.parent = 0;
			this.path = [this.id];
		    return this.path; // return default
		} else {
			this.path = [id];
			var subpath = obj.nodes[this.parent].Getpath(obj,true); // use cache if exists
			for (var is in subpath) {
				this.path.push(subpath[is]);
			}
		    return this.path;
		}
    }
}

function Newstheme (id) {

    this.id = id;
    this.parents = [];
    this.title = 'Theme '+id;
    this.url = '';
    this.anons = '';
    this.image = false;
	this.news = [];
	this.keywords = [];
	this.pd = currdate;
    this.type = 1;
	this.weight = 0;
	this.ci = 0;
    this.response = {};
}

function Newstitle (tid, id) {

    this.id = id;
    this.keywords = [];
    this.theme = tid;
    this.title = 'News '+id;
    this.anons = '';
    this.body = '';
    this.image = false;
	this.pd = currdate;
	this.age = 0;
    this.type = 1;
	this.weight = 1;
}

function reconvert (echo) {
	echo = echo.replace(/\xAB/g,"&laquo;");
	echo = echo.replace(/\xBB/g,"&raquo;");
	echo = echo.replace(/\x96/g,"&mdash;");
	echo = echo.replace(/\x97/g,"&mdash;");
	echo = echo.replace(/\x93/g,"&quote;");
	echo = echo.replace(/\x94/g,"&quote;");
	
	echo = new Buffer(echo, 'binary');
    echo = iconv.convert(echo).toString();
	
	echo = echo.replace(/\x13/g,"&mdash;");
	return echo;
}

function geturl (url)
{
	url = parseInt(url,10);
	url = (url > 0 ? url : 0);

	if (url > 999999) {
		url = url.toString().replace(/^(\d+)(\d\d)(\d\d)(\d\d)$/,"$1/$2/$3/$1$2$3$4");
	} else {
		url = ('000000'+url).slice(-6);
		url = url.replace(/^(\d\d)(\d\d)(\d\d)$/,"0/$1/$2/$1$2$3");
	}
	url = url.replace(/\/0*([^0\/]\d*)$/,"\/$1");
	
	return url;
}

function geturlshort (url)
{
	url = parseInt(url,10);
	url = (url > 0 ? url : 0);

	if (url.match(/^(\d\d)(\d\d)(\d*)$/)) url = url.toString().replace(/^(\d\d)(\d\d)(\d*)$/,"$2/$1$2$3");
	else if (url.match(/^(\d\d)(\d)$/)) url = url.toString().replace(/^(\d\d)(\d)$/,"$1\/$1$2");
	else if (url.match(/^(\d\d)$/)) url = url.toString().replace(/^(\d\d)$/,"$1\/$1");
	else url = url.toString().replace(/^(\d)$/,"0$1\/$1");
	
	return url;
}

function gettitleurl (title)
{
	title = encodeURI(reconvert(title.toLowerCase()));

	title = title.replace(/&(laquo|raquo|qout|mdash);/ig,"");
	title = title.replace(/[^a-z0-9\%]+/ig,"_");
	title = title.replace(/%20/g,"_");
	title = title.replace(/[ _]+/g,"_");
	title = title.replace(/_$/,"");
	title = title.replace(/^_/,"");

	return title;
}