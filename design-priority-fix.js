/* Talentera Huddle preview — keep Priority Actions counts aligned with executive focus. */
(function () {
  'use strict';

  const safeArray = value => Array.isArray(value) ? value : [];
  const number = value => Number(value || 0);

  function leadRows() {
    const contacts = window.D && window.D.outreachCoverage && window.D.outreachCoverage.contacts || {};
    return safeArray(contacts.notContactedList).map(row => Object.assign({}, row, {
      _type: row._type || 'Lead needs contact',
      _kind: 'lead',
      _severity: 3
    }));
  }

  function dealRows() {
    return safeArray(window.D && window.D.repData).flatMap(rep => [
      ...safeArray(rep.needsAttention).map(row => Object.assign({}, row, {
        ownerName: row.ownerName || rep.name,
        _type: 'No next activity',
        _kind: 'deal',
        _severity: 3
      })),
      ...safeArray(rep.stuck).map(row => Object.assign({}, row, {
        ownerName: row.ownerName || rep.name,
        _type: 'Stuck deal',
        _kind: 'deal',
        _severity: 3
      })),
      ...safeArray(rep.cold).map(row => Object.assign({}, row, {
        ownerName: row.ownerName || rep.name,
        _type: 'Cold deal',
        _kind: 'deal',
        _severity: 2
      }))
    ]);
  }

  function counts() {
    const contacts = window.D && window.D.outreachCoverage && window.D.outreachCoverage.contacts || {};
    const leads = leadRows();
    const deals = dealRows();
    const leadCount = number(contacts.notContacted) || leads.length;
    const dealCount = deals.length;

    return {
      contacts,
      leads,
      deals,
      leadCount,
      dealCount,
      total: leadCount + dealCount
    };
  }

  window.openPriorityLeadActions = function openPriorityLeadActions() {
    const data = counts();
    window.showRowsModal(
      'Lead Actions (' + data.leadCount.toLocaleString() + ')',
      data.leadCount.toLocaleString() + ' eligible leads have no connected call · ' + data.leads.length.toLocaleString() + ' row-level records exported',
      data.leads,
      'The summary count is available, but the matching row-level lead records are not exported in the current data.json refresh.'
    );
  };

  window.openPriorityDealActions = function openPriorityDealActions() {
    const data = counts();
    window.showRowsModal(
      'Deal Actions (' + data.dealCount.toLocaleString() + ')',
      'Cold, stuck and no-next-activity action signals across the acquisition team.',
      data.deals,
      'No deal action rows were exported in the current data refresh.'
    );
  };

  window.openAllPriorityActions = function openAllPriorityActions() {
    const data = counts();
    const available = data.leads.concat(data.deals);
    window.showRowsModal(
      'Total Priority Actions (' + data.total.toLocaleString() + ')',
      data.leadCount.toLocaleString() + ' lead actions + ' + data.dealCount.toLocaleString() + ' deal actions · ' + available.length.toLocaleString() + ' row-level records available',
      available,
      'Priority counts exist, but no row-level records were exported in the current data refresh.'
    );
  };

  function patchPrioritySection() {
    if (!window.D) return;

    const grid = document.getElementById('priorityMiniGrid');
    const badge = document.getElementById('priorityBadge');
    const section = document.getElementById('prioritySection');
    if (!grid || !section) return;

    const data = counts();
    const cards = Array.from(grid.querySelectorAll('.priority-mini'));
    const values = [data.leadCount, data.dealCount, data.total];
    const labels = ['Lead actions', 'Deal actions', 'Total priority actions'];
    const handlers = [
      window.openPriorityLeadActions,
      window.openPriorityDealActions,
      window.openAllPriorityActions
    ];

    cards.forEach((card, index) => {
      const value = card.querySelector('.priority-mini-v');
      const label = card.querySelector('.priority-mini-l');
      if (value) value.textContent = Number(values[index] || 0).toLocaleString();
      if (label) label.textContent = labels[index];
      card.onclick = handlers[index];
    });

    if (badge) badge.textContent = data.total.toLocaleString() + ' actions';

    const listButton = section.querySelector('.priority-list .see-more');
    if (listButton) {
      listButton.textContent = 'View available rows · ' + data.total.toLocaleString() + ' total actions →';
      listButton.onclick = window.openAllPriorityActions;
    }

    const actionButton = section.querySelector('.priority-actions .see-more');
    if (actionButton) {
      actionButton.textContent = 'Open all priority actions →';
      actionButton.onclick = window.openAllPriorityActions;
    }

    section.dataset.priorityCountsPatched = '1';
  }

  const observer = new MutationObserver(function () {
    patchPrioritySection();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  patchPrioritySection();
  window.setTimeout(patchPrioritySection, 250);
  window.setTimeout(patchPrioritySection, 1000);
})();
