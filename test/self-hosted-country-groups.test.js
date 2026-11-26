const test = require('node:test');
const assert = require('node:assert/strict');

function convert(proxies, args = {}) {
  const modulePath = require.resolve('../src/substore/convert');
  delete require.cache[modulePath];
  global.$arguments = args;
  return require(modulePath).main({ proxies: structuredClone(proxies) });
}

const nbDirect = {
  name: '🇸🇬 NB 新加坡 02', type: 'vless', server: '192.0.2.2', port: 443,
  'reality-opts': { 'public-key': 'fixture-key' }, network: 'tcp'
};
const nbCdn = {
  name: '🇸🇬 NB 新加坡 01', type: 'vless', server: 'cdn.example', port: 443,
  network: 'xhttp', 'xhttp-opts': { host: 'tunnel.example' }
};
const hongKong = [
  { name: '🇭🇰 Alpha 香港 自建 01', type: 'ss' },
  { name: '🇭🇰 Beta HK 自建 CDN 02', type: 'trojan' }
];
const airport = { name: '🇸🇬 良心云 新加坡 01', type: 'vless', 'reality-opts': {} };

const modes = [
  {}, { regex: true }, { smart: true }, { smart: true, regex: true },
  { loadbalance: true }, { full: true, android: true },
  { landing: true }, { landing: true, akcdnfallback: true }
];

test('self-hosted country selectors include both NB direct and CDN paths across modes', () => {
  const proxies = [nbDirect, nbCdn, airport, ...hongKong];
  for (const args of modes) {
    const result = convert(proxies, args);
    const groups = Object.fromEntries(result['proxy-groups'].map((g) => [g.name, g]));
    assert.deepEqual(groups['新加坡自建'].proxies, [nbDirect.name, nbCdn.name]);
    assert.deepEqual(groups['香港自建'].proxies, hongKong.map((p) => p.name));
    for (const name of ['新加坡自建', '香港自建']) {
      assert.equal(groups[name].type, 'select');
      assert.match(groups[name].icon, /\/flag\/.+\.svg$/);
      for (const field of ['include-all', 'filter', 'url', 'interval']) {
        assert.equal(groups[name][field], undefined, field);
      }
      for (const parent of ['节点选择', 'GLOBAL', 'YouTube', 'Google', '人工智能']) {
        assert.ok(groups[parent].proxies.includes(name), `${parent} exposes ${name}`);
      }
    }
    assert.ok(!groups['日本自建']);
    assert.ok(!groups['新加坡直连']);
    assert.deepEqual(result.proxies, proxies, 'node names and connection fields stay unchanged');
    assert.deepEqual(groups['全球直连'].proxies, ['DIRECT', '节点选择']);
  }
});

test('existing default choices and policy order survive the added ownership shortcuts', () => {
  const withoutLabel = (name) => name.replace(/\bNB\b/g, 'OtherVendor');
  for (const args of modes) {
    const input = [nbDirect, nbCdn, airport];
    const baseline = convert(input.map((p) => ({ ...p, name: withoutLabel(p.name) })), args);
    const updated = convert(input, args);
    const groups = Object.fromEntries(updated['proxy-groups'].map((g) => [g.name, g]));
    for (const group of baseline['proxy-groups']) {
      // Regional membership now deliberately excludes self-hosted nodes; tested separately.
      if (group.name === '新加坡节点') continue;
      assert.deepEqual(
        { ...groups[group.name], ...(groups[group.name].proxies
          ? { proxies: groups[group.name].proxies.filter((n) => n !== '新加坡自建').map(withoutLabel) } : {}) },
        group,
        `${group.name}: only the new shortcut is added`
      );
    }
    assert.deepEqual(updated.rules, baseline.rules);
    assert.deepEqual(updated.dns, baseline.dns);
  }
});

test('ownership groups exclude airport direct labels, IX, landing, chained and unclassified nodes', () => {
  const excluded = [
    airport,
    { name: '🇭🇰 Airport 香港 直连 01', type: 'vless' },
    { name: '🇭🇰 IX 香港 自建 01', type: 'vless' },
    { name: '🇸🇬 落地 新加坡 自建 01', type: 'vless' },
    { name: '🇭🇰 Alpha 香港 自建 01', type: 'vless', 'dialer-proxy': '前置代理' },
    { name: 'Unknown 自建 01', type: 'ss' },
    { name: '香港自建', type: 'direct' }
  ];
  assert.ok(!convert(excluded)['proxy-groups'].some((g) => /^(香港|新加坡|Unknown)自建$/.test(g.name)));
  assert.ok(!convert([])['proxy-groups'].some((g) => /自建$/.test(g.name)));
});

test('NB ownership follows region without requiring a particular protocol or numeric suffix', () => {
  const future = { ...nbCdn, name: '🇭🇰 NB 香港 07' };
  const groups = convert([future])['proxy-groups'];
  assert.deepEqual(groups.find((g) => g.name === '香港自建').proxies, [future.name]);
  assert.ok(!groups.some((g) => g.name === '新加坡自建'));
});

test('IX and country landings keep their existing members and root preference', () => {
  const proxies = [
    nbDirect, nbCdn,
    { name: '🇸🇬 IX 新加坡 01', type: 'vmess' },
    { name: '🇹🇼 落地 台湾 01', type: 'vless', 'dialer-proxy': '前置代理' },
    { name: '🇭🇰 Airport 香港 01', type: 'ss' }
  ];
  const groups = Object.fromEntries(convert(proxies, { landing: true, akcdnfallback: true })['proxy-groups'].map((g) => [g.name, g]));
  assert.deepEqual(groups['IX节点'].proxies, ['🇸🇬 IX 新加坡 01']);
  assert.deepEqual(groups['台湾落地'].proxies, ['🇹🇼 落地 台湾 01']);
  assert.equal(groups['节点选择'].proxies[0], 'IX节点');
  assert.deepEqual(groups['新加坡自建'].proxies, [nbDirect.name, nbCdn.name]);
});

test('a node cannot shadow an automatically generated self-hosted country group', () => {
  assert.throws(() => convert([{ name: '香港自建', type: 'ss' }]),
    /Proxy name conflicts with generated group: 香港自建/);
});

test('self-hosted shortcuts are near the top and beside low-cost groups, not at the country tail', () => {
  for (const args of modes) {
    for (const withLowCost of [false, true]) {
      const proxies = [nbDirect, nbCdn, airport, ...hongKong,
        { name: '🇭🇰 Airport 香港 01', type: 'ss' },
        ...(withLowCost ? [{ name: '🇯🇵 Airport 日本 0.5x', type: 'ss' }] : [])];
      const groups = Object.fromEntries(convert(proxies, args)['proxy-groups'].map((g) => [g.name, g]));
      const hosted = ['新加坡自建', '香港自建'];
      for (const parent of ['节点选择', 'YouTube', 'Google', '人工智能']) {
        assert.deepEqual(groups[parent].proxies.slice(1, 3), hosted, `${parent}: priority shortcuts`);
        assert.ok(groups[parent].proxies.indexOf('香港自建') < groups[parent].proxies.indexOf('香港节点'));
      }
      assert.equal(groups['节点选择'].proxies[0], '自动选择');
      assert.equal(groups.YouTube.proxies[0], '节点选择');
      const global = groups.GLOBAL.proxies;
      const anchor = global.indexOf(groups['低倍率节点'] ? '低倍率节点' : '强制代理');
      assert.deepEqual(global.slice(anchor - hosted.length, anchor), hosted);
      assert.ok(global.indexOf('香港自建') < global.indexOf('香港节点'));
    }
  }
});

test('prioritizing self-hosted shortcuts does not replace landing or front-proxy defaults', () => {
  const proxies = [nbDirect, nbCdn,
    { name: '🇹🇼 落地 台湾 01', type: 'vless', 'dialer-proxy': '前置代理' },
    { name: '🇭🇰 Airport 香港 01', type: 'ss' }];
  const groups = Object.fromEntries(convert(proxies, { landing: true })['proxy-groups'].map((g) => [g.name, g]));
  assert.deepEqual(groups['节点选择'].proxies.slice(0, 2), ['台湾落地', '新加坡自建']);
  assert.equal(groups['前置代理'].proxies[0], '自动选择');
  assert.ok(groups['前置代理'].proxies.indexOf('新加坡自建') > groups['前置代理'].proxies.indexOf('香港节点'));
});

function members(group, proxies) {
  if (group.proxies) return group.proxies;
  const regex = (pattern) => new RegExp(pattern.replace(/^\(\?i\)/, ''), 'i');
  return proxies.filter((proxy) => regex(group.filter).test(proxy.name) &&
    !regex(group['exclude-filter']).test(proxy.name)).map((proxy) => proxy.name);
}

test('ordinary country groups and self-hosted groups have disjoint members across modes', () => {
  const hkAirport = { name: '🇭🇰 Airport 香港 01', type: 'ss' };
  const proxies = [nbDirect, nbCdn, airport, ...hongKong, hkAirport];
  for (const args of modes) {
    const groups = Object.fromEntries(convert(proxies, args)['proxy-groups'].map((g) => [g.name, g]));
    assert.deepEqual(members(groups['新加坡节点'], proxies), [airport.name]);
    assert.deepEqual(members(groups['香港节点'], proxies), [hkAirport.name]);
    assert.deepEqual(groups['新加坡自建'].proxies, [nbDirect.name, nbCdn.name]);
    assert.deepEqual(groups['香港自建'].proxies, hongKong.map((p) => p.name));
    // The request concerns ordinary country groups, not the existing global auto policy.
    const globalAutoExclude = new RegExp(groups['自动选择']['exclude-filter'].replace(/^\(\?i\)/, ''), 'i');
    assert.equal(globalAutoExclude.test(nbDirect.name), false);
    assert.equal(globalAutoExclude.test(nbCdn.name), false);
  }
});

test('a region containing only self-hosted nodes has no empty ordinary group or dangling reference', () => {
  const proxies = [nbDirect, nbCdn, ...hongKong];
  for (const args of modes) {
    const result = convert(proxies, args);
    const groups = Object.fromEntries(result['proxy-groups'].map((g) => [g.name, g]));
    assert.ok(groups['新加坡自建'] && groups['香港自建']);
    assert.ok(!groups['新加坡节点'] && !groups['香港节点']);
    for (const group of result['proxy-groups']) {
      assert.ok(!(group.proxies || []).includes('新加坡节点'));
      assert.ok(!(group.proxies || []).includes('香港节点'));
    }
    assert.equal(groups['节点选择'].proxies[0], '自动选择');
  }
});

test('regex-mode country exclusion escapes exact self-hosted names and retains dialer exclusion', () => {
  const special = { ...nbDirect, name: '🇸🇬 NB 新加坡 [0.5]+(02).*' };
  const chained = { name: '🇸🇬 Other 新加坡 chained 01', type: 'vless', 'dialer-proxy': '前置代理' };
  const proxies = [special, airport, chained];
  const groups = Object.fromEntries(convert(proxies, { regex: true, landing: true })['proxy-groups'].map((g) => [g.name, g]));
  assert.deepEqual(members(groups['新加坡节点'], proxies), [airport.name]);
  assert.deepEqual(groups['新加坡自建'].proxies, [special.name]);
});

function reachable(groupName, groups, proxies) {
  const group = groups[groupName];
  if (!group) return [groupName];
  const matches = (pattern, name) => new RegExp(pattern.replace(/^\(\?i\)/, ''), 'i').test(name);
  const children = [...(group.proxies || [])];
  if (group['include-all']) children.push(...proxies.filter(({ name }) =>
    (!group.filter || matches(group.filter, name)) &&
    (!group['exclude-filter'] || !matches(group['exclude-filter'], name))
  ).map((p) => p.name));
  return [...new Set(children.flatMap((name) => reachable(name, groups, proxies)))];
}

test('every relay path excludes only the landing region’s self-hosted nodes, including cheap NB aliases', () => {
  const sgExit = { name: '🇸🇬 NB 新加坡 落地 01', type: 'ss', server: 'sg-exit', 'dialer-proxy': '前置代理' };
  const hkExit = { ...sgExit, name: '香港 落地 01', server: 'hk-exit' };
  const sgCheap = { ...nbCdn, name: 'SG 自建 [0.5x] 03' };
  const cheap = { name: '日本 机场 0.5x', type: 'ss' };
  const ix = { name: 'IX 台湾 01', type: 'ss' };
  const alias = { name: '新加坡 机场别名', type: 'ss', server: sgExit.server };
  for (const extraExit of [[], [hkExit]]) {
    const input = [sgExit, ...extraExit, airport, ...hongKong, nbDirect, nbCdn, sgCheap, cheap, ix, alias];
    for (const args of [{}, { regex: true }, { smart: true }, { loadbalance: true }, { akcdnfallback: true, regex: true },
      { smart: true, loadbalance: true, akcdnfallback: true }]) {
      const config = convert(input, { ...args, landing: true });
      const groups = Object.fromEntries(config['proxy-groups'].map((g) => [g.name, g]));
      const exits = config.proxies.filter((p) => p['dialer-proxy']);
      assert.equal(exits[0]['dialer-proxy'], extraExit.length ? '新加坡前置代理' : '前置代理');
      for (const p of exits) {
        const front = p['dialer-proxy'];
        const isSg = p.name === sgExit.name;
        const same = isSg ? [nbDirect, nbCdn, sgCheap] : hongKong;
        const other = isSg ? hongKong : [nbDirect, nbCdn, sgCheap];
        assert.ok(groups.GLOBAL.proxies.includes(front));
        const leaves = reachable(front, groups, config.proxies);
        for (const node of [...same, sgExit, hkExit, ix, alias]) assert.ok(!leaves.includes(node.name), node.name);
        for (const node of [...other, airport, cheap]) assert.ok(leaves.includes(node.name), node.name);
        const manual = groups[front].proxies.find((name) => name.endsWith('中转手动切换'));
        const automatic = groups[front].proxies.find((name) => name.endsWith('中转自动切换'));
        assert.equal(groups[automatic].type, args.smart ? 'smart' : 'url-test');
        assert.ok(!groups[front].proxies.some((name) => name.endsWith('中转自动选择')));
        assert.deepEqual(groups[automatic].proxies, input.filter((node) =>
          [...other, airport, cheap].includes(node)).map((node) => node.name));
        assert.deepEqual(new Set(groups[manual].proxies), new Set([...other, airport, cheap].map((n) => n.name)));
        assert.ok(groups['节点选择'].proxies.includes(isSg ? '新加坡自建' : '香港自建'));
      }
      const again = convert(config.proxies, { ...args, landing: true });
      assert.deepEqual(again['proxy-groups'], config['proxy-groups']);
      assert.deepEqual(again.proxies, config.proxies);
    }
  }
});

test('single landing keeps a safe airport shortcut; a different region without exclusions shares no restrictions', () => {
  const landing = { name: '落地 SG', type: 'ss', 'dialer-proxy': '前置代理' };
  const other = { ...landing, name: '台湾 落地' };
  const custom = { ...landing, name: '香港 落地', 'dialer-proxy': airport.name };
  for (const regex of [false, true]) {
    const single = convert([landing, nbDirect, airport], { landing: true, regex });
    assert.ok(single['proxy-groups'].find((g) => g.name === '前置代理').proxies.includes('新加坡节点'));
    const multi = convert([landing, other, custom, nbDirect, airport], { landing: true, regex });
    const groups = Object.fromEntries(multi['proxy-groups'].map((g) => [g.name, g]));
    assert.deepEqual(multi.proxies.slice(0, 3).map((p) => p['dialer-proxy']),
      ['新加坡前置代理', '前置代理', airport.name]);
    assert.ok(reachable('前置代理', groups, multi.proxies).includes(nbDirect.name));
    assert.ok(!reachable('新加坡前置代理', groups, multi.proxies).includes(nbDirect.name));
  }
});

test('an empty same-region relay pool never falls back to the excluded node', () => {
  const proxies = [{ name: '落地 SG', type: 'ss', 'dialer-proxy': '前置代理' }, nbCdn];
  for (const strict of [false, true]) {
    const result = convert(strict ? [...proxies, { name: 'IX 台湾', type: 'ss' }] : proxies,
      { landing: true, akcdnfallback: strict });
    const group = result['proxy-groups'].find((g) => g.name === '前置代理');
    assert.deepEqual(group.proxies, [strict ? 'REJECT' : 'DIRECT']);
  }
});


test('ordinary landing offers Smart or URL-test first-hop selection only with multiple candidates', () => {
  const landing = { name: '落地 台湾', type: 'ss', 'dialer-proxy': '前置代理' };
  for (const smart of [false, true]) {
    for (const relays of [[], [airport], [airport, nbDirect]]) {
      const groups = Object.fromEntries(convert([landing, ...relays], { landing: true, smart })['proxy-groups']
        .map((g) => [g.name, g]));
      const front = groups['前置代理'].proxies;
      assert.equal(front[0], relays.length ? '自动选择' : 'DIRECT');
      assert.equal(front.includes('中转自动切换'), relays.length > 1);
      assert.equal(Boolean(groups['中转自动切换']), relays.length > 1);
      if (relays.length > 1) {
        assert.equal(groups['中转自动切换'].type, smart ? 'smart' : 'url-test');
        assert.deepEqual(groups['中转自动切换'].proxies, relays.map((node) => node.name));
      }
    }
  }
});


test('unscoped and country-specific landings enforce the same relay pool on every menu path', () => {
  const landing = { name: '新加坡 落地', type: 'ss', server: 'exit', 'dialer-proxy': '前置代理' };
  const ix = { name: 'IX 台湾 01', type: 'ss' };
  const bad = [
    { name: '香港 机场占位 0.5x', type: 'reject' },
    { name: '直连占位', type: 'direct' },
    { name: '日本 机场别名', type: 'ss', server: 'EXIT' },
    { name: '日本 0.5x 链', type: 'ss', 'dialer-proxy': airport.name }
  ];
  for (const hosted of [[], [nbDirect]]) {
    for (const relays of [[], [airport], [airport, ...hongKong]]) {
      for (const strict of [false, true]) {
        for (const regex of [false, true]) {
          const input = [landing, ix, ...bad, ...hosted, ...relays];
          const config = convert(input, { landing: true, akcdnfallback: strict, regex, smart: true });
          const groups = Object.fromEntries(config['proxy-groups'].map((g) => [g.name, g]));
          const allowed = [...relays.map((p) => p.name), ...(strict ? (relays.length ? [] : ['REJECT']) : ['DIRECT'])];
          assert.deepEqual(new Set(reachable('前置代理', groups, input)), new Set(allowed));
          if (!relays.length) assert.deepEqual(groups['前置代理'].proxies, allowed);
          if (relays.length) assert.deepEqual(groups['中转手动切换'].proxies, relays.map((p) => p.name));
          assert.equal(Boolean(groups['中转自动切换']), relays.length > 1);
        }
      }
    }
  }
});

test('runtime provider templates remain dynamic, but cannot widen a managed landing pool', () => {
  global.$arguments = { landing: true, regex: true };
  const file = require.resolve('../src/substore/convert');
  delete require.cache[file];
  const { main } = require(file);
  const generate = (proxies) => {
    const config = main({ proxies, 'proxy-providers': { airport: { type: 'file', path: './airport.yaml' } } });
    return Object.fromEntries(config['proxy-groups'].map((g) => [g.name, g]));
  };
  const template = generate([])['前置代理'];
  assert.ok(template['include-all']);
  assert.ok(template.proxies.includes('低倍率节点'));
  const proxies = [{ name: '落地 台湾', type: 'ss', 'dialer-proxy': '前置代理' }, airport, nbDirect];
  const groups = generate(proxies);
  const menu = groups['前置代理'];
  assert.ok(!menu['include-all'] && !menu.proxies.includes('自动选择'));
  for (const choice of menu.proxies) assert.ok(!groups[choice]?.['include-all']);
  assert.deepEqual(new Set(reachable('前置代理', groups, proxies)), new Set(['DIRECT', airport.name, nbDirect.name]));
});
