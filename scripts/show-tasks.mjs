const PROJECT_ID = 'tal-coordinator';
const API_KEY = 'AIzaSyA_ac19dgbIp3hYNOXmet3J_DgjOWckPes';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
function unwrap(v){if(!v)return v;if('stringValue'in v)return v.stringValue;if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;if('booleanValue'in v)return v.booleanValue;if('nullValue'in v)return null;if('arrayValue'in v)return(v.arrayValue.values??[]).map(unwrap);if('mapValue'in v){const o={};for(const[k,val]of Object.entries(v.mapValue.fields??{}))o[k]=unwrap(val);return o;}return v;}
function unwrapDoc(d){const o={_id:d.name.split('/').pop()};for(const[k,v]of Object.entries(d.fields??{}))o[k]=unwrap(v);return o;}
const body={structuredQuery:{from:[{collectionId:'tasks'}],where:{fieldFilter:{field:{fieldPath:'allianceId'},op:'EQUAL',value:{stringValue:'hoc'}}}}};
const res=await fetch(`${BASE}:runQuery?key=${API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const data=await res.json();
const tasks=data.filter(r=>r.document).map(r=>unwrapDoc(r.document));
for(const t of tasks){console.log(`order=${t.order}  isTeleport=${!!t.isTeleport}  ${t.name}  (${t._id})`);}
