/* Pure demo state machine. No production API or permission mutations. */
(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const scenarios={
 cross:{name:'跨域高价值发现',query:'圈出电商消费较低、但生服消费较高的潜在高价值用户',domain:'跨域',object:'跨域潜在高价值用户',signal:'两域消费分层同时满足',source:'PRD · 跨域高价值人群捞取',failure:'mapping',fields:['电商消费分层','生服消费分层','跨域关联标识']},
 travel:{name:'土地公个性化圈人',query:'圈出近期有出游意向、偏好中高端住宿、在土地公有咨询行为的用户',domain:'生服',object:'土地公咨询用户中的出游与住宿偏好人群',signal:'出游信号 AND 住宿偏好 AND 咨询行为',source:'PRD · 土地公场景',failure:'stale',fields:['出游意向标签','住宿偏好标签','土地公咨询行为']},
 brand:{name:'品牌营销圈人',query:'给波司登找对羽绒服感兴趣、近90天有服饰消费、中高消费能力的用户',domain:'跨域',object:'波司登羽绒服目标用户',signal:'羽绒服兴趣 AND 服饰成交 AND 消费分层',source:'PRD · 品牌营销案例',failure:'definition',fields:['服饰兴趣标签','服饰成交记录','消费能力分层']},
 uplift:{name:'实验高增益人群',query:'找出这个实验里对发券最敏感的20%用户',domain:'生服',object:'发券高增益候选人群',signal:'已存在的 Uplift 分数前20%',source:'PRD · Uplift 场景',failure:'model',fields:['实验 Uplift 分数','实验合格用户范围']},
 theme:{name:'榜单主题圈人',query:'为通勤穿搭榜单圈出相关兴趣人群',domain:'跨域',object:'通勤穿搭兴趣人群',signal:'主题关联兴趣标签',source:'PRD · 毕喆榜单主题案例',failure:'missing',fields:['主题兴趣标签','用户偏好标签']},
 custom:{name:'自定义圈人任务',query:'',domain:'生服',object:'',signal:'',source:'业务原话 · 人工确认',failure:'missing',fields:['待匹配核心资产']}
};
const featured=['brand','acquisition','recall','repurchase','local','cross'];
Object.assign(scenarios,{
 brand:{name:'厂家 / 品牌找人',query:'给波司登找对羽绒服感兴趣、近90天有服饰消费、中高消费能力的用户，用于新品推广',domain:'电商',object:'羽绒服新品推广目标人群',signal:'商品兴趣 AND 类目成交 AND 消费分层',source:'业务示例 · 品牌营销直接圈人',failure:'definition',fields:['商品兴趣行为','类目成交记录','消费能力分层']},
 acquisition:{name:'品牌拉新',query:'为运动鞋品牌找近90天买过运动鞋、但没有买过本品牌的新客',domain:'电商',object:'品牌潜在新客',signal:'类目购买 AND 排除品牌已购',source:'抽象场景 · 品牌拉新',failure:'definition',fields:['类目购买记录','品牌历史成交']},
 recall:{name:'沉默用户召回',query:'找出近180天买过美妆、最近一段时间没有购买的老用户，用于召回',domain:'电商',object:'历史购买后的沉默用户',signal:'历史成交 AND 最近未购',source:'抽象场景 · 老客召回',failure:'definition',fields:['历史购买记录','最近购买时间']},
 repurchase:{name:'复购 / 补货提醒',query:'为洗护厂家找近90天买过洗发水、可能进入补货期的用户',domain:'电商',object:'进入候选补货期的已购用户',signal:'历史购买 AND 约定补货间隔',source:'抽象场景 · 周期复购',failure:'definition',fields:['商品购买记录','购买间隔']},
 local:{name:'门店获客',query:'为上海的一家火锅门店找近30天对火锅有兴趣的潜在到店用户',domain:'生服',object:'门店服务范围内的火锅兴趣用户',signal:'兴趣行为 AND 可服务区域',source:'抽象场景 · 门店获客',failure:'definition',fields:['到店品类兴趣','城市或商圈范围']}
});
const blockers={missing:'核心资产缺失',permission:'权限不足',definition:'核心口径待确认',mapping:'跨域 ID 映射不可用',stale:'资产过期',model:'Uplift 模型结果缺失',sample:'结果样本量过小',sql:'SQL 执行失败'};
function classify(q){if(/建表|建设底表|新增字段/.test(q))return '基建';if(/年度规划|业务规划|明年方向/.test(q))return '规划';if(/开发|上线弹窗|新建功能/.test(q)&&!/圈|筛选/.test(q))return '功能';if(/分析|特点|为什么/.test(q)&&!/圈|筛选|找出/.test(q))return '分析';return /复用|历史策略/.test(q)?'复用历史策略':'直接圈人';}
function detect(q){if(/uplift|增益|最敏感/i.test(q))return 'uplift';if(/召回|沉默|流失/.test(q))return 'recall';if(/复购|补货/.test(q))return 'repurchase';if(/新客|拉新|没有买过本品牌/.test(q))return 'acquisition';if(/门店|火锅|到店/.test(q))return 'local';if(/电商/.test(q)&&/生服/.test(q))return 'cross';if(/通勤|榜单/.test(q))return 'theme';if(/出游|住宿|酒店/.test(q))return 'travel';if(/品牌|厂家|波司登|羽绒服|新品/.test(q))return 'brand';return 'custom';}
function initialFields(q,key,scope){
 const period=q.match(/近\s*(\d+)\s*天/);const raw={value:q,status:'原话提取',source:'业务原话'};
 const domain=/电商/.test(q)&&/生服/.test(q)?'跨域':/生服|门店|到店/.test(q)?'生服':scenarios[key].domain==='跨域'?'跨域':scope==='ldmp'&&key==='custom'?'生服':scenarios[key].domain;
 return {object:{...raw},action:{value:/推广|营销|品牌/.test(q)?'营销目标人群圈选':/召回/.test(q)?'老客召回':/复购|补货/.test(q)?'复购候选人群圈选':'按原话生成目标人群',status:'场景理解',source:'原话与场景，支持修改'},window:{value:period?period[1]:'',status:period?'原话提取':'待补充',source:period?'业务原话':'未明确'},domain:{value:domain,status:'上下文提取',source:'所选入口与场景范围；执行时检查授权'},definition:{...raw},platform:{value:'交付时补充；本次只生成方案，不下发',status:'后续补充',source:'当前任务范围'},exclude:{value:/没有买过本品牌/.test(q)?'排除本品牌已购用户；品牌范围与回溯期待决策':'按原话排除；无额外业务排除不自行添加。平台治理约束单独检查',status:'原话提取',source:'业务原话与任务边界'},success:{value:'人群符合本次定义并通过业务抽检；收益需后续实验验证',status:'流程约定',source:'本次交付验收'},experiment:{value:'',status:'待补充',source:'仅实验驱动场景需要'}};
}
function create(q,key,scope='portal'){
 key=key||detect(q);const s=scenarios[key],stamp=Date.now();return {schema:1,interactionVersion:2,id:'DEMO-'+stamp.toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,5).toUpperCase(),title:s.name,created:new Date().toISOString(),query:q,scenario:key,scope,stage:1,version:1,type:classify(q),fields:initialFields(q,key,scope),decisions:{},notes:[],materials:[],confirmed:false,strategy:null,strategyConfirmed:false,conditions:[],conditionConfirmed:false,blocker:null,attempts:0,runs:[],result:null,versions:[],history:[],archived:false,adoption:'未采纳',destination:'',reuse:false,attachedAssets:[],metrics:{revisions:0},feedback:''};
}
const questionSpecs={
 window:{title:'这次按多长时间观察行为？',why:'时间窗口会改变入选人群，原话没有给出具体天数。',choices:['30','90'],field:'window'},
 interest:{title:'什么行为算“对商品感兴趣”？',why:'只看搜索、收藏、加购，比把普通浏览也算入更收敛。',choices:['主动搜索、收藏或加购命中相关商品 / 品类','主动行为或相关内容互动均可；不把一次普通曝光算兴趣']},
 spending:{title:'“中高消费”采用哪个口径？',why:'全平台消费能力与目标类目的购买能力可能不同。以下是待匹配资产的示例口径。',choices:['目标类目消费分层 L3 及以上（示例口径）','全平台消费分层 L3 及以上（示例口径）']},
 brandScope:{title:'本品牌具体指哪个品牌？',why:'示例尚未给出品牌名称，不能自动拿品类代替品牌。',choices:[]},
 newCustomer:{title:'本品牌新客，回溯多久没有购买？',why:'近90天未购和历史从未购买是两种不同的新客定义；历史数据覆盖需要再核验。',choices:['近365天无本品牌成交','可用完整历史中无本品牌成交；覆盖不足时阻断']},
 dormant:{title:'多久没买，才算进入召回范围？',why:'“最近一段时间”不能自动等于流失，业务需要定义最近未购窗口。',choices:['最近30天没有该品类成交','最近60天没有该品类成交']},
 cycle:{title:'按什么间隔识别补货候选人群？',why:'买过商品不能直接证明已经用完；这里只圈候选人群，不推断真实用量。',choices:['距最近购买30至60天（示例，业务需核实）','距最近购买60至90天（示例，业务需核实）']},
 area:{title:'门店能服务到哪个区域？',why:'只知道城市仍无法判断门店可达性；距离方案必须有获准的位置与门店资产。',choices:['上海市范围，先做城市级兴趣人群','门店周边3公里（示例，需补门店标识和获准位置资产）']},
 store:{title:'用于距离圈选的门店标识是什么？',why:'没有门店基准位置，无法执行周边距离条件。演示请使用 DEMO- 开头的标识。',choices:[]},
 crossBasis:{title:'两域的高低消费各采用什么口径？',why:'电商低消费不能直接和生服高消费共用同一个分层标准。',choices:['电商 L1/L2 且生服 L4/L5；分别采用各域定义（示例）']},
 definition:{title:'还缺哪条关键的人群入选标准？',why:'目前没有足够的业务定义，系统不能自行替你决定圈谁。',choices:[],field:'definition'},
 experiment:{title:'使用哪份实验结果与目标指标？',why:'发券候选人群不等于高增益人群；必须有已有模型或实验结果。',choices:[],field:'experiment'}
};
function questions(t){
 if(t.interactionVersion!==2)return legacyMissing(t).map(k=>({id:k,title:'补充或修正'+k,why:'历史任务需核对关键口径',choices:[],field:k}));
 const q=t.query,ids=[];if(!/^\d+$/.test(t.fields.window.value)||+t.fields.window.value<1||+t.fields.window.value>3650)ids.push('window');
 if(/感兴趣|有兴趣|兴趣人群/.test(q)&&!/搜索|收藏|加购|互动/.test(q))ids.push('interest');
 if(/中高消费|消费能力中高|高消费能力/.test(q)&&!/(?:L[1-5]|金额.{0,8}[0-9]|[0-9]+元)/i.test(q))ids.push('spending');
 if(t.scenario==='acquisition'){if(/本品牌/.test(q)&&!t.decisions.brandScope)ids.push('brandScope');if(!/近\d+天无本品牌|历史从未购买/.test(q))ids.push('newCustomer');}
 if(t.scenario==='recall'&&!/最近\d+天.{0,5}(没有|未)/.test(q))ids.push('dormant');
 if(t.scenario==='repurchase'&&!/距.{0,10}\d+.{0,5}\d+天/.test(q))ids.push('cycle');
 if(t.scenario==='local'){ids.push('area');if(/公里/.test(t.decisions.area||''))ids.push('store');}
 if(t.scenario==='cross')ids.push('crossBasis');
 if(['custom','travel','theme'].includes(t.scenario)&&t.fields.definition.status!=='已确认')ids.push('definition');
 if(t.scenario==='uplift'&&!t.fields.experiment.value)ids.push('experiment');
 return [...new Set(ids)].filter(id=>!t.decisions[id]).map(id=>({id,...questionSpecs[id]}));
}
function answer(t,id,value){const spec=questionSpecs[id];if(!spec)throw Error('未知问题');value=value.trim();if(!value)throw Error('请填写关键口径');if(id==='window'&&(!/^\d+$/.test(value)||+value<1||+value>3650))throw Error('时间窗口需为1至3650天');if(id==='store'&&!/^DEMO-/.test(value))throw Error('演示门店请使用 DEMO- 标识');t.decisions[id]=value;if(spec.field)t.fields[spec.field]={value,status:'已确认',source:'业务补充'};t.fields.definition={value:[t.query,...Object.entries(t.decisions).filter(([key])=>key!=='window').map(([key,v])=>questionSpecs[key].title+' '+v)].join('；'),status:'业务决策',source:'业务原话与关键决策'};if(t.scenario==='acquisition'&&t.decisions.newCustomer)t.fields.exclude={value:t.decisions.newCustomer+'；品牌 '+(t.decisions.brandScope||'按原话'),status:'已确认',source:'业务关键决策'};log(t,'补充关键决策：'+spec.title);}
function legacyMissing(t){return ['object','window','domain','definition'].filter(k=>!t.fields[k].value.trim()||!['已确认','已明确','不适用'].includes(t.fields[k].status));}
function log(t,action){t.history.push({at:new Date().toISOString(),version:t.version,action,actor:'当前演示用户'});}
function missing(t){return questions(t).map(q=>q.id);}
function confirm(t){if(!['直接圈人','复用历史策略','分析转圈人'].includes(t.type))throw Error('该请求不在当前圈人执行范围');if(missing(t).length)throw Error('请补齐会改变人群结果的关键口径');if(t.scope==='ldmp'&&t.fields.domain.value!=='生服')throw Error('LDMP 演示仅限生服资产，请回门户创建其他域任务');t.confirmed=true;t.stage=2;log(t,'按当前理解生成方案；明确原话与业务决策已保留');}
function select(t,ids){if(!t.confirmed)throw Error('请先确认需求');if(!ids.length)throw Error('请选择策略');t.strategy={ids,note:'',evidence:scenarios[t.scenario].source};t.strategyConfirmed=true;t.stage=3;t.conditions=scenarios[t.scenario].fields.map((name,i)=>({id:'DEMO-ASSET-'+t.scenario+'-'+i,name,domain:t.fields.domain.value==='跨域'?(i%2?'生服':'电商'):t.fields.domain.value,owner:'演示供应方',assetVersion:'demo.1',updated:'2026-09-28',definition:t.fields.definition.value,group:'必须满足',operator:'符合',value:t.fields.definition.value,core:true,permission:'演示可用'}));t.conditions.push({id:'DEMO-GUARD',name:'营销授权与业务排除',domain:'平台',owner:'演示治理规则',assetVersion:'demo.1',updated:'2026-09-28',definition:t.fields.exclude.value,group:'排除',operator:'排除',value:t.fields.exclude.value,core:true,locked:true,permission:'演示可用'});t.conditions.unshift({id:'DEMO-SIGNAL',name:'策略证据强度',domain:t.fields.domain.value,owner:'演示策略配置',assetVersion:'demo.1',updated:'2026-09-28',definition:'候选策略对应的示例信号范围，仍需确认',group:'必须满足',operator:'符合',value:ids.map(id=>({conservative:'强信号',balanced:'中强信号',explore:'弱信号待验证',direct:'业务完整定义'}[id]||id)).join(' 或 '),core:true,permission:'演示可用'});t.conditionConfirmed=false;log(t,'策略已确认，构建演示条件');}
function validation(t){const errors=[];if(!t.confirmed||!t.strategyConfirmed)errors.push('需求或方案尚未确定');if(t.blocker)errors.push(blockers[t.blocker]||t.blocker);if(!t.conditions.length)errors.push('尚无核心条件');if(t.conditions.some(c=>!c.value.trim()))errors.push('核心条件取值缺失');if(t.conditions.some(c=>c.permission!=='演示可用'))errors.push('资产权限不可用');if(t.scope==='ldmp'&&t.fields.domain.value!=='生服')errors.push('超出 LDMP 生服范围');return errors;}
function executable(t){return t.conditionConfirmed&&validation(t).length===0;}
function snapshot(t,reason){return {version:t.version,reason,at:new Date().toISOString(),fields:clone(t.fields),decisions:clone(t.decisions||{}),interactionVersion:t.interactionVersion,strategy:clone(t.strategy),conditions:clone(t.conditions),result:clone(t.result),confirmed:t.confirmed,strategyConfirmed:t.strategyConfirmed,conditionConfirmed:t.conditionConfirmed};}
function revise(t,level,reason){t.versions.push(snapshot(t,reason));t.version++;t.metrics.revisions++;t.result=null;t.archived=false;t.conditionConfirmed=false;t.stage=level;if(level<=1){t.confirmed=false;t.strategyConfirmed=false;t.strategy=null;t.conditions=[];}else if(level<=2){t.strategyConfirmed=false;}log(t,reason+'；下游结果待重算');}
function sql(t){const cond=JSON.stringify({window:t.fields.window.value,strategy:t.strategy,conditions:t.conditions.map(c=>({group:c.group,asset:c.id,value:c.value}))});return '-- 演示 SQL · 无真实表映射，不可用于生产\n-- task '+t.id+' / v'+t.version+'\n-- 确认条件 '+cond.replace(/[\r\n]/g,' ')+'\nSELECT demo_user_id\nFROM demo_authorized_audience\nWHERE demo_rule_version = '+t.version+';';}
function run(t,fail){if(!executable(t))throw Error('核心条件未通过校验，禁止执行');if(t.attempts>=3)throw Error('连续三轮未达标，已停止自动尝试，请转人工');t.stage=4;const run={id:'DEMO-RUN-'+(t.runs.length+1),version:t.version,at:new Date().toISOString(),sql:sql(t),status:fail?'失败':'完成',reason:fail?blockers[fail]||fail:null};t.runs.push(run);if(fail){t.attempts++;log(t,run.reason);return run;}t.attempts=0;t.result={version:t.version,runId:run.id,size:12840+t.conditions.length*237,coverage:87,seed:t.seedRef?92:null,excluded:1360,missing:42,partition:'DEMO / 2026-09-27',sql:run.sql,approved:false,sampleIds:['DEMO-USER-001','DEMO-USER-002','DEMO-USER-003']};log(t,'模拟执行完成，等待业务复核');return run;}
function approve(t){if(!t.result||t.result.version!==t.version||t.blocker)throw Error('无当前有效结果');t.result.approved=true;t.stage=5;log(t,'业务复核通过，MVP 方案完成（演示）');}
function restore(t,v){const target=t.versions.find(x=>x.version===v);if(!target)throw Error('版本不存在');revise(t,1,'从 v'+v+'恢复为新版本');t.fields=clone(target.fields);t.decisions=clone(target.decisions||{});Object.values(t.fields).forEach(f=>{if(f.status==='已确认')f.status='待确认';});}
const api={scenarios,featured,questions,answer,blockers,clone,classify,detect,create,log,missing,confirm,select,validation,executable,snapshot,revise,run,approve,restore,sql};if(typeof module!=='undefined')module.exports=api;root.AudienceEngine=api;
})(typeof window!=='undefined'?window:globalThis);
