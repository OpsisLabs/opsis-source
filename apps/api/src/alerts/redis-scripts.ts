/** All mutations execute atomically on the existing single Redis store. No scans,
 * plaintext chat IDs, CONFIG SET, or expiry extensions on firing. */
export const ALERTS_PREFIX = "opsis:alerts:v1:";
export const ALERTS_SCRIPT = `
local p=KEYS[1]
local op=ARGV[1]
local function k(s) return p..s end
local function trim(z, now)
  redis.call('ZREMRANGEBYSCORE',k(z),'-inf',now)
  for _,id in ipairs(redis.call('ZRANGE',k(z),0,-1)) do
    local key=z=='active' and k('rule:'..id) or k('journal:'..id)
    if redis.call('EXISTS',key)==0 then redis.call('ZREM',k(z),id) end
  end
end
local function zttl(z)
  local top=redis.call('ZREVRANGE',k(z),0,0,'WITHSCORES')
  if #top>0 then redis.call('PEXPIREAT',k(z),top[2]) end
end
local function chatclean(h)
  local latest=0
  for _,id in ipairs(redis.call('SMEMBERS',k('chat:'..h))) do
    local raw=redis.call('GET',k('rule:'..id))
    if not raw then redis.call('SREM',k('chat:'..h),id)
    else latest=math.max(latest,cjson.decode(raw).expiresAt) end
  end
  if latest>0 then redis.call('PEXPIREAT',k('chat:'..h),latest) end
end
if op=='create' then
  local row=cjson.decode(ARGV[2]); local now=tonumber(ARGV[3])
  trim('active',now); chatclean(row.deliveryHmac)
  if redis.call('SCARD',k('chat:'..row.deliveryHmac))>=3 then return 'ALERTS_RULE_LIMIT' end
  if redis.call('ZCARD',k('active'))>=1000 then return 'ALERTS_CAPACITY_STOP' end
  redis.call('SET',k('rule:'..row.id),ARGV[2]); redis.call('PEXPIREAT',k('rule:'..row.id),row.expiresAt)
  redis.call('SADD',k('chat:'..row.deliveryHmac),row.id); chatclean(row.deliveryHmac)
  redis.call('ZADD',k('active'),row.expiresAt,row.id); zttl('active')
  return 'OK'
elseif op=='list' then
  chatclean(ARGV[2]); return redis.call('SMEMBERS',k('chat:'..ARGV[2]))
elseif op=='active' or op=='events' then
  local z=op=='active' and 'active' or 'journal-index'
  trim(z,tonumber(ARGV[2])); return redis.call('ZRANGE',k(z),0,1000)
elseif op=='remove' then
  local h=ARGV[2]; local count=0
  for _,id in ipairs(redis.call('SMEMBERS',k('chat:'..h))) do
    if ARGV[3]=='' or ARGV[3]==id then
      local raw=redis.call('GET',k('rule:'..id))
      if not raw or cjson.decode(raw).deliveryHmac==h then
        count=count+redis.call('DEL',k('rule:'..id))
        for _,event in ipairs(redis.call('SMEMBERS',k('journals:'..id))) do
          redis.call('DEL',k('journal:'..event)); redis.call('ZREM',k('journal-index'),event)
        end
        redis.call('DEL',k('journals:'..id)); redis.call('ZREM',k('active'),id)
        redis.call('SREM',k('chat:'..h),id)
      end
    end
  end
  chatclean(h); zttl('active'); zttl('journal-index'); return count
elseif op=='cleanup' then
  local before=redis.call('ZCARD',k('active'))
  trim('active',tonumber(ARGV[2])); trim('journal-index',tonumber(ARGV[2]))
  return before-redis.call('ZCARD',k('active'))
elseif op=='enqueue' then
  local row=cjson.decode(ARGV[2]); local now=tonumber(ARGV[3])
  local rule=redis.call('GET',k('rule:'..row.ruleId))
  if not rule then return 0 end
  local expiry=math.min(cjson.decode(rule).expiresAt,now+2592000000)
  if expiry<=now then return 0 end
  if redis.call('EXISTS',k('journal:'..row.id))==1 then return 0 end
  trim('journal-index',now)
  if redis.call('ZCARD',k('journal-index'))>=1000 then return 'ALERTS_CAPACITY_STOP' end
  redis.call('SET',k('journal:'..row.id),ARGV[2]); redis.call('PEXPIREAT',k('journal:'..row.id),expiry)
  redis.call('SADD',k('journals:'..row.ruleId),row.id); redis.call('PEXPIREAT',k('journals:'..row.ruleId),expiry)
  redis.call('ZADD',k('journal-index'),expiry,row.id); zttl('journal-index'); return 1
elseif op=='observe' then
  local raw=redis.call('GET',k('rule:'..ARGV[2])); if not raw then return 0 end
  local row=cjson.decode(raw); local update=cjson.decode(ARGV[3])
  for field,value in pairs(update) do row[field]=value end
  redis.call('SET',k('rule:'..ARGV[2]),cjson.encode(row),'KEEPTTL'); return 1
elseif op=='mark' or op=='correct' or op=='claim' then
  local key=k('journal:'..ARGV[2]); local raw=redis.call('GET',key)
  if not raw then return 0 end
  local row=cjson.decode(raw)
  if op=='mark' then
    local state=ARGV[3]
    if (state=='orphaned' and row.state~='sent') or (state=='skipped' and row.state~='pending') then return 0 end
    row.state=state
  else
    -- Fence state claims against stale processes as well as the follower checks.
    if ARGV[4]~='' and redis.call('GET',k('lease'))~=ARGV[4] then return 0 end
    local rulekey=k('rule:'..row.ruleId); local ruleRaw=redis.call('GET',rulekey)
    if not ruleRaw then return 0 end
    local rule=cjson.decode(ruleRaw); local now=tonumber(ARGV[3])
    if rule.expiresAt<=now then return 0 end
    if op=='correct' then
      if row.state~='orphaned' then return 0 end; row.state='corrected'
    else
      if row.state~='pending' then return 0 end
      if string.sub(row.eventKey,1,4)~='gap:' then
        if rule.lastFiredAt~=cjson.null and now-rule.lastFiredAt<rule.cooldown*1000 then return 0 end
        rule.lastFiredAt=now
        redis.call('SET',rulekey,cjson.encode(rule),'KEEPTTL')
      end
      row.state='sent'
    end
  end
  redis.call('SET',key,cjson.encode(row),'KEEPTTL'); return 1
end
return redis.error_reply('ALERTS_OPERATION_INVALID')
`;
