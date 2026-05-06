import React, { useEffect, useMemo, useState } from 'react';
import {
  getAssetSummary,
  getAssetReports,
  getAssetMasters,
  getAssets,
  saveAsset,
  updateAsset,
  getAssetComponents,
  addAssetComponent,
  replaceAssetComponent,
  getAssetComponentMovements,
  getAssetWarranties,
  saveAssetWarranty,
  getAssetIssues,
  saveAssetIssue,
  updateAssetIssueStatus,
  getAssetRepairs,
  saveAssetRepair,
  getAssetReplacements,
  saveAssetReplacement,
  getAssetMovements,
  getAssetStockItems,
  saveAssetStockItem,
  updateAssetStockItem,
  getAssetStockMovements,
  saveAssetStockMovement,
  updateAssetDesk,
  getAssetDeskHistory,
  moveAsset
} from '../services/assetService';
import '../styles/AssetManagement.css';

const Card = ({ label, value, hint, tone }) => (
  <div className={`card border-0 shadow-sm h-100 asset-metric-card asset-tone-${tone}`}>
    <div className="card-body">
      <div className="text-uppercase small fw-semibold text-muted">{label}</div>
      <div className="display-6 fw-bold mb-1">{value}</div>
      <div className="text-muted small">{hint}</div>
    </div>
  </div>
);

const QuickActionCard = ({ title, value, hint, buttonLabel, onClick, tone = 'primary' }) => (
  <div className="card border-0 shadow-sm h-100 asset-quick-card">
    <div className="card-body d-flex flex-column">
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <div className="text-uppercase small fw-semibold text-muted">{title}</div>
          <div className="display-6 fw-bold mb-1">{value}</div>
        </div>
        <span className={`badge text-bg-${tone}`}>{buttonLabel}</span>
      </div>
      <div className="text-muted small mb-3">{hint}</div>
      <button type="button" className="btn btn-sm btn-outline-dark mt-auto align-self-start" onClick={onClick}>
        Open
      </button>
    </div>
  </div>
);

const inputClass = 'form-control';

const emptyWarrantyForm = {
  asset_id: '',
  vendor_id: '',
  warranty_type: '',
  warranty_start_date: '',
  warranty_end_date: '',
  coverage_notes: '',
  notes: ''
};

const emptyIssueForm = {
  asset_id: '',
  issue_title: '',
  issue_description: '',
  severity: 'medium',
  warranty_claimed: false,
  office_id: '',
  desk_id: ''
};

const emptyRepairForm = {
  asset_id: '',
  issue_id: '',
  vendor_id: '',
  technician_name: '',
  repair_action: '',
  parts_used: '',
  repair_cost: '',
  started_at: '',
  completed_at: '',
  outcome: '',
  notes: ''
};

const emptyReplacementForm = {
  old_asset_id: '',
  new_asset_id: '',
  replacement_reason: '',
  disposal_method: '',
  notes: ''
};

const emptyAssetEditForm = {
  asset_tag: '',
  asset_name: '',
  category_id: '',
  vendor_id: '',
  office_id: '',
  desk_id: '',
  assigned_user_id: '',
  brand: '',
  model: '',
  serial_number: '',
  purchase_date: '',
  purchase_price: '',
  warranty_start_date: '',
  warranty_end_date: '',
  warranty_type: '',
  status: 'in_stock',
  condition: 'good',
  notes: '',
  warranty_notes: ''
};

const emptyComponentForm = {
  component_type: '',
  component_name: '',
  brand: '',
  model: '',
  serial_number: '',
  specification: '',
  notes: ''
};

const emptyComponentReplaceForm = {
  component_id: '',
  component_type: '',
  component_name: '',
  brand: '',
  model: '',
  serial_number: '',
  specification: '',
  reason: '',
  notes: ''
};

const emptyStockItemForm = {
  item_code: '',
  item_name: '',
  item_type: 'spare',
  category_id: '',
  vendor_id: '',
  office_id: '',
  desk_id: '',
  quantity_on_hand: '0',
  minimum_quantity: '0',
  unit_price: '',
  serial_number: '',
  status: 'available',
  notes: ''
};

const emptyStockMovementForm = {
  stock_item_id: '',
  movement_type: 'received',
  quantity_change: '',
  from_office_id: '',
  from_desk_id: '',
  to_office_id: '',
  to_desk_id: '',
  reason: '',
  notes: ''
};

const emptyDeskForm = {
  office_id: '',
  desk_label: '',
  official_email: '',
  assigned_user_id: '',
  floor_label: '',
  location_note: '',
};

const emptyDeskMoveForm = {
  asset_id: '',
  to_office_id: '',
  to_desk_id: '',
  reason: ''
};

const getDeskFloorLabel = (desk) => {
  if (desk?.office_code && String(desk.office_code).toUpperCase() !== 'HQ') {
    return 'Main Area';
  }
  if (desk?.floor_label) return String(desk.floor_label);

  const floorSources = [desk?.location_note, desk?.office_name, desk?.office_code]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const source of floorSources) {
    const match = source.match(/\b(ground|gf|g\.?\s*floor|[0-9]{1,2}(?:st|nd|rd|th)?\s*floor|level\s*[0-9]{1,2}|l\s*[0-9]{1,2})\b/i);
    if (!match) continue;
    const token = match[0].replace(/\s+/g, ' ').trim();
    if (/^ground|^gf|^g\.?\s*floor/i.test(token)) return 'Ground Floor';
    if (/^level/i.test(token)) return token.replace(/^level/i, 'Level');
    if (/^l\s*[0-9]/i.test(token)) return token.toUpperCase();
    return token.replace(/\bfloor\b/i, 'Floor');
  }

  return 'Unspecified Floor';
};

const floorSortKey = (label) => {
  if (/^main area$/i.test(label)) return 0;
  if (/^ground floor$/i.test(label)) return -1;
  const numericMatch = label.match(/[0-9]{1,2}/);
  if (numericMatch) return Number(numericMatch[0]);
  return 999;
};

const getDeskOccupantLabel = (desk) => {
  if (!desk?.assigned_user_id) return 'Unassigned';
  const designation = String(desk?.assigned_user_designation || '').trim();
  const department = String(desk?.assigned_user_department || '').trim();
  if (designation && department) return `${designation} (${department})`;
  return designation || department || String(desk?.assigned_user_name || 'Assigned User');
};

const getDeskUserName = (desk) => {
  if (!desk?.assigned_user_id) return 'Unassigned';
  const assignedName = String(desk?.assigned_user_name || '').trim();
  if (assignedName) return assignedName;
  const deskLabel = String(desk?.desk_label || '').trim();
  return deskLabel || 'Assigned User';
};

const getDeskRoleLabel = (desk) => {
  if (!desk?.assigned_user_id) return 'Open desk';
  const designation = String(desk?.assigned_user_designation || '').trim();
  const department = String(desk?.assigned_user_department || '').trim();
  if (designation && department) return `${designation} (${department})`;
  return designation || department || 'Role not set';
};

const getDeskNoSortValue = (deskNo) => {
  const normalized = String(deskNo || '').trim();
  const numeric = normalized.match(/[0-9]+/);
  if (!numeric) return Number.POSITIVE_INFINITY;
  return Number(numeric[0]);
};

const AssetManagement = () => {
  const [summary, setSummary] = useState(null);
  const [masters, setMasters] = useState({ offices: [], desks: [], categories: [], vendors: [], users: [] });
  const [assets, setAssets] = useState([]);
  const [warranties, setWarranties] = useState([]);
  const [issues, setIssues] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [replacements, setReplacements] = useState([]);
  const [movements, setMovements] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [stockMovements, setStockMovements] = useState([]);
  const [reports, setReports] = useState({
    assets_by_office: [],
    assets_by_category: [],
    asset_status_counts: [],
    warranty_soon_assets: [],
    open_issues: [],
    low_stock_items: [],
    vendor_spend: [],
    monthly_purchase_summary: [],
    repair_cost_summary: []
  });
  const [search, setSearch] = useState('');
  const [assetOfficeFilter, setAssetOfficeFilter] = useState('all');
  const [assetCategoryFilter, setAssetCategoryFilter] = useState('all');
  const [assetStatusFilter, setAssetStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState('assets');
  const [editingAsset, setEditingAsset] = useState(null);
  const [creatingAsset, setCreatingAsset] = useState(false);
  const [editingStockItem, setEditingStockItem] = useState(null);
  const [assetComponents, setAssetComponents] = useState([]);
  const [componentMovements, setComponentMovements] = useState([]);
  const [componentForm, setComponentForm] = useState(emptyComponentForm);
  const [componentReplaceForm, setComponentReplaceForm] = useState(emptyComponentReplaceForm);
  const [componentBusy, setComponentBusy] = useState(false);
  const [componentStatus, setComponentStatus] = useState(null);
  const [warrantyForm, setWarrantyForm] = useState(emptyWarrantyForm);
  const [issueForm, setIssueForm] = useState(emptyIssueForm);
  const [repairForm, setRepairForm] = useState(emptyRepairForm);
  const [replacementForm, setReplacementForm] = useState(emptyReplacementForm);
  const [assetEditForm, setAssetEditForm] = useState(emptyAssetEditForm);
  const [stockItemForm, setStockItemForm] = useState(emptyStockItemForm);
  const [stockEditForm, setStockEditForm] = useState(emptyStockItemForm);
  const [stockMovementForm, setStockMovementForm] = useState(emptyStockMovementForm);
  const [deskOfficeFilter, setDeskOfficeFilter] = useState('all');
  const [deskFloorFilter, setDeskFloorFilter] = useState('all');
  const [deskSearch, setDeskSearch] = useState('');
  const [selectedDeskId, setSelectedDeskId] = useState(null);
  const [deskForm, setDeskForm] = useState(emptyDeskForm);
  const [deskMoveForm, setDeskMoveForm] = useState(emptyDeskMoveForm);
  const [deskMoveModalOpen, setDeskMoveModalOpen] = useState(false);
  const [deskMoveError, setDeskMoveError] = useState('');
  const [deskAssignmentSaving, setDeskAssignmentSaving] = useState(false);
  const [deskAssignmentStatus, setDeskAssignmentStatus] = useState(null);
  const [deskHistory, setDeskHistory] = useState([]);

  const assetOptions = useMemo(() => assets, [assets]);

  const refreshDeskMasters = async () => {
    const mastersData = await getAssetMasters();
    setMasters({
      offices: Array.isArray(mastersData?.offices) ? mastersData.offices : [],
      desks: Array.isArray(mastersData?.desks) ? mastersData.desks : [],
      categories: Array.isArray(mastersData?.categories) ? mastersData.categories : [],
      vendors: Array.isArray(mastersData?.vendors) ? mastersData.vendors : [],
      users: Array.isArray(mastersData?.users) ? mastersData.users : []
    });
  };

  const load = async (assetSearch = search) => {
    setLoading(true);
    setLoadError('');
    try {
      const [
        summaryResult,
        reportsResult,
        mastersResult,
        assetsResult,
        warrantiesResult,
        issuesResult,
        repairsResult,
        replacementsResult,
        movementsResult,
        stockItemsResult,
        stockMovementsResult
      ] = await Promise.allSettled([
        getAssetSummary(),
        getAssetReports(),
        getAssetMasters(),
        getAssets({ search: assetSearch }),
        getAssetWarranties(),
        getAssetIssues(),
        getAssetRepairs(),
        getAssetReplacements(),
        getAssetMovements(),
        getAssetStockItems(),
        getAssetStockMovements()
      ]);

      const pickValue = (result, fallback) => (result.status === 'fulfilled' ? result.value : fallback);
      const failedResults = [
        summaryResult,
        reportsResult,
        mastersResult,
        assetsResult,
        warrantiesResult,
        issuesResult,
        repairsResult,
        replacementsResult,
        movementsResult,
        stockItemsResult,
        stockMovementsResult
      ].filter((result) => result.status === 'rejected');

      const summaryData = pickValue(summaryResult, null);
      const reportsData = pickValue(reportsResult, null);
      const mastersData = pickValue(mastersResult, null);
      const assetsData = pickValue(assetsResult, []);
      const warrantiesData = pickValue(warrantiesResult, []);
      const issuesData = pickValue(issuesResult, []);
      const repairsData = pickValue(repairsResult, []);
      const replacementsData = pickValue(replacementsResult, []);
      const movementsData = pickValue(movementsResult, []);
      const stockItemsData = pickValue(stockItemsResult, []);
      const stockMovementsData = pickValue(stockMovementsResult, []);

      setSummary(summaryData);
      setReports({
        assets_by_office: Array.isArray(reportsData?.assets_by_office) ? reportsData.assets_by_office : [],
        assets_by_category: Array.isArray(reportsData?.assets_by_category) ? reportsData.assets_by_category : [],
        asset_status_counts: Array.isArray(reportsData?.asset_status_counts) ? reportsData.asset_status_counts : [],
        warranty_soon_assets: Array.isArray(reportsData?.warranty_soon_assets) ? reportsData.warranty_soon_assets : [],
        open_issues: Array.isArray(reportsData?.open_issues) ? reportsData.open_issues : [],
        low_stock_items: Array.isArray(reportsData?.low_stock_items) ? reportsData.low_stock_items : [],
        vendor_spend: Array.isArray(reportsData?.vendor_spend) ? reportsData.vendor_spend : [],
        monthly_purchase_summary: Array.isArray(reportsData?.monthly_purchase_summary) ? reportsData.monthly_purchase_summary : [],
        repair_cost_summary: Array.isArray(reportsData?.repair_cost_summary) ? reportsData.repair_cost_summary : []
      });
      setMasters({
        offices: Array.isArray(mastersData?.offices) ? mastersData.offices : [],
        desks: Array.isArray(mastersData?.desks) ? mastersData.desks : [],
        categories: Array.isArray(mastersData?.categories) ? mastersData.categories : [],
        vendors: Array.isArray(mastersData?.vendors) ? mastersData.vendors : [],
        users: Array.isArray(mastersData?.users) ? mastersData.users : []
      });
      setAssets(Array.isArray(assetsData) ? assetsData : []);
      setWarranties(Array.isArray(warrantiesData) ? warrantiesData : []);
      setIssues(Array.isArray(issuesData) ? issuesData : []);
      setRepairs(Array.isArray(repairsData) ? repairsData : []);
      setReplacements(Array.isArray(replacementsData) ? replacementsData : []);
      setMovements(Array.isArray(movementsData) ? movementsData : []);
      setStockItems(Array.isArray(stockItemsData) ? stockItemsData : []);
      setStockMovements(Array.isArray(stockMovementsData) ? stockMovementsData : []);

      if (failedResults.length) {
        const unauthorized = failedResults.some((result) => Number(result.reason?.response?.status) === 403);
        setLoadError(
          unauthorized
            ? 'You do not have permission to view Asset Management data yet.'
            : 'Some asset data could not be loaded right now. Desk map may be partially available.'
        );
      }
    } catch (error) {
      console.error('[AssetManagement] load:', error);
      const statusCode = Number(error?.response?.status || 0);
      setLoadError(
        statusCode === 403
          ? 'You do not have permission to view Asset Management data yet.'
          : 'Asset Management data could not be loaded right now.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load(search);
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const loadAssetComponentData = async (assetId) => {
    if (!assetId) {
      setAssetComponents([]);
      setComponentMovements([]);
      return;
    }
    const [componentsData, movementsData] = await Promise.all([
      getAssetComponents(assetId),
      getAssetComponentMovements(assetId)
    ]);
    setAssetComponents(Array.isArray(componentsData) ? componentsData : []);
    setComponentMovements(Array.isArray(movementsData) ? movementsData : []);
  };

  useEffect(() => {
    const assetId = editingAsset?.id;
    if (!assetId) {
      setAssetComponents([]);
      setComponentMovements([]);
      return;
    }
    loadAssetComponentData(assetId).catch((error) => {
      console.error('[AssetManagement] loadAssetComponentData:', error);
      setAssetComponents([]);
      setComponentMovements([]);
    });
  }, [editingAsset]);

  const submitWarranty = async (event) => {
    event.preventDefault();
    await saveAssetWarranty(warrantyForm);
    setWarrantyForm(emptyWarrantyForm);
    await load();
  };

  const submitIssue = async (event) => {
    event.preventDefault();
    await saveAssetIssue(issueForm);
    setIssueForm(emptyIssueForm);
    await load();
  };

  const submitRepair = async (event) => {
    event.preventDefault();
    await saveAssetRepair(repairForm);
    setRepairForm(emptyRepairForm);
    await load();
  };

  const submitReplacement = async (event) => {
    event.preventDefault();
    await saveAssetReplacement(replacementForm);
    setReplacementForm(emptyReplacementForm);
    await load();
  };

  const openAssetEdit = (asset) => {
    setCreatingAsset(false);
    setEditingAsset(asset);
    setComponentForm(emptyComponentForm);
    setComponentReplaceForm(emptyComponentReplaceForm);
    setComponentStatus(null);
    setAssetEditForm({
      asset_tag: asset.asset_tag || '',
      asset_name: asset.asset_name || '',
      category_id: asset.category_id || '',
      vendor_id: asset.vendor_id || '',
      office_id: asset.office_id || '',
      desk_id: asset.desk_id || '',
      assigned_user_id: asset.assigned_user_id || '',
      brand: asset.brand || '',
      model: asset.model || '',
      serial_number: asset.serial_number || '',
      purchase_date: asset.purchase_date || '',
      purchase_price: asset.purchase_price ?? '',
      warranty_start_date: asset.warranty_start_date || '',
      warranty_end_date: asset.warranty_end_date || '',
      warranty_type: asset.warranty_type || '',
      status: asset.status || 'in_stock',
      condition: asset.condition || 'good',
      notes: asset.notes || '',
      warranty_notes: asset.warranty_notes || ''
    });
  };

  const openStockEdit = (item) => {
    setCreatingAsset(false);
    setEditingStockItem(item);
    setStockEditForm({
      item_code: item.item_code || '',
      item_name: item.item_name || '',
      item_type: item.item_type || 'spare',
      category_id: item.category_id || '',
      vendor_id: item.vendor_id || '',
      office_id: item.office_id || '',
      desk_id: item.desk_id || '',
      quantity_on_hand: item.quantity_on_hand ?? 0,
      minimum_quantity: item.minimum_quantity ?? 0,
      unit_price: item.unit_price ?? '',
      serial_number: item.serial_number || '',
      status: item.status || 'available',
      notes: item.notes || ''
    });
  };

  const openDeskDetail = (desk) => {
    setSelectedDeskId(desk.id);
    setDeskForm({
      office_id: desk.office_id || '',
      desk_label: desk.desk_label || '',
      official_email: desk.official_email || '',
      assigned_user_id: desk.assigned_user_id || '',
      floor_label: desk.floor_label || '',
      location_note: desk.location_note || ''
    });
    setDeskMoveForm(emptyDeskMoveForm);
    setDeskMoveModalOpen(false);
    setDeskMoveError('');
    setDeskAssignmentStatus(null);
    setDeskHistory([]);
  };

  const openDeskMoveModal = (assetId = '') => {
    if (!selectedDesk) return;
    const moveReason = `Moved from Desk ${selectedDesk.desk_no}`;
    setDeskMoveForm({
      asset_id: assetId ? String(assetId) : '',
      to_office_id: selectedDesk.office_id ? String(selectedDesk.office_id) : '',
      to_desk_id: '',
      reason: moveReason
    });
    setDeskMoveError('');
    setDeskMoveModalOpen(true);
  };

  const closeDeskMoveModal = () => {
    setDeskMoveModalOpen(false);
    setDeskMoveError('');
    setDeskMoveForm(emptyDeskMoveForm);
  };

  const closeEdit = () => {
    setCreatingAsset(false);
    setEditingAsset(null);
    setEditingStockItem(null);
    setAssetEditForm(emptyAssetEditForm);
    setStockEditForm(emptyStockItemForm);
    setAssetComponents([]);
    setComponentMovements([]);
    setComponentForm(emptyComponentForm);
    setComponentReplaceForm(emptyComponentReplaceForm);
    setComponentStatus(null);
  };

  const openAddAsset = () => {
    setCreatingAsset(true);
    setEditingStockItem(null);
    setEditingAsset(null);
    setAssetComponents([]);
    setComponentMovements([]);
    setComponentForm(emptyComponentForm);
    setComponentReplaceForm(emptyComponentReplaceForm);
    setComponentStatus(null);
    setAssetEditForm({
      ...emptyAssetEditForm,
      office_id: selectedDesk?.office_id || '',
      desk_id: selectedDesk?.id || '',
      assigned_user_id: selectedDesk?.assigned_user_id || ''
    });
  };

  const submitAssetEdit = async (event) => {
    event.preventDefault();
    if (!editingAsset) return;
    await updateAsset(editingAsset.id, assetEditForm);
    closeEdit();
    await load();
  };

  const submitAssetComponent = async () => {
    if (!editingAsset?.id) return;
    if (!componentForm.component_type || !componentForm.component_name) {
      setComponentStatus({ type: 'error', message: 'Component type and component name are required.' });
      return;
    }
    setComponentBusy(true);
    setComponentStatus(null);
    try {
      await addAssetComponent(editingAsset.id, componentForm);
      setComponentForm(emptyComponentForm);
      await loadAssetComponentData(editingAsset.id);
      await load(search);
      setComponentStatus({ type: 'success', message: 'Component added successfully.' });
    } catch (error) {
      const message = error?.response?.data?.detail || error?.response?.data?.message || error?.message || 'Failed to add component.';
      setComponentStatus({ type: 'error', message });
    } finally {
      setComponentBusy(false);
    }
  };

  const submitComponentReplace = async () => {
    if (!editingAsset?.id) return;
    if (!componentReplaceForm.component_id) {
      setComponentStatus({ type: 'error', message: 'Select a component to replace.' });
      return;
    }
    if (!componentReplaceForm.serial_number) {
      setComponentStatus({ type: 'error', message: 'New serial number is required for replacement.' });
      return;
    }
    setComponentBusy(true);
    setComponentStatus(null);
    try {
      await replaceAssetComponent(componentReplaceForm.component_id, componentReplaceForm);
      setComponentReplaceForm(emptyComponentReplaceForm);
      await loadAssetComponentData(editingAsset.id);
      await load(search);
      setComponentStatus({ type: 'success', message: 'Component replaced successfully.' });
    } catch (error) {
      const message = error?.response?.data?.detail || error?.response?.data?.message || error?.message || 'Failed to replace component.';
      setComponentStatus({ type: 'error', message });
    } finally {
      setComponentBusy(false);
    }
  };

  const submitAssetCreate = async (event) => {
    event.preventDefault();
    await saveAsset(assetEditForm);
    closeEdit();
    await load();
  };

  const submitStockEdit = async (event) => {
    event.preventDefault();
    if (!editingStockItem) return;
    await updateAssetStockItem(editingStockItem.id, stockEditForm);
    closeEdit();
    await load();
  };

  const submitStockItem = async (event) => {
    event.preventDefault();
    await saveAssetStockItem(stockItemForm);
    setStockItemForm(emptyStockItemForm);
    await load();
  };

  const submitStockMovement = async (event) => {
    event.preventDefault();
    await saveAssetStockMovement(stockMovementForm);
    setStockMovementForm(emptyStockMovementForm);
    await load();
  };

  const submitDeskAssignment = async (event) => {
    event.preventDefault();
    if (!selectedDeskId) return;
    setDeskAssignmentSaving(true);
    setDeskAssignmentStatus(null);
    try {
      const updatedDesk = await updateAssetDesk(selectedDeskId, deskForm);
      setMasters((prev) => ({
        ...prev,
        desks: (prev.desks || []).map((desk) => (
          String(desk.id) === String(selectedDeskId)
            ? { ...desk, ...updatedDesk }
            : desk
        ))
      }));

      setDeskAssignmentStatus({ type: 'success', message: 'Desk assignment updated successfully.' });

      // Refresh history in background; avoid blocking save UX on this secondary request.
      if (selectedDeskId) {
        getAssetDeskHistory(selectedDeskId)
          .then((history) => setDeskHistory(Array.isArray(history) ? history : []))
          .catch((historyError) => {
            console.error('[AssetManagement] getAssetDeskHistory after save:', historyError);
          });
      }
    } catch (error) {
      const message = error?.response?.data?.detail || error?.response?.data?.message || error?.message || 'Failed to update desk assignment.';
      setDeskAssignmentStatus({ type: 'error', message });
    } finally {
      setDeskAssignmentSaving(false);
    }
  };

  const submitDeskAssetMove = async (event) => {
    event.preventDefault();
    const destinationDesk = (masters.desks || []).find((desk) => String(desk.id) === String(deskMoveForm.to_desk_id));
    if (!deskMoveForm.asset_id) {
      setDeskMoveError('Select an asset to transfer.');
      return;
    }
    if (!deskMoveForm.to_desk_id) {
      setDeskMoveError('Select a destination desk.');
      return;
    }
    if (String(deskMoveForm.to_desk_id) === String(selectedDeskId)) {
      setDeskMoveError('Destination desk must be different from current desk.');
      return;
    }
    setDeskMoveError('');
    try {
      await moveAsset(deskMoveForm.asset_id, {
        to_office_id: deskMoveForm.to_office_id || destinationDesk?.office_id || null,
        to_desk_id: deskMoveForm.to_desk_id || null,
        reason: deskMoveForm.reason || 'Moved from desk map'
      });
      closeDeskMoveModal();
      await load();
    } catch (error) {
      const message = error?.response?.data?.detail || error?.response?.data?.message || error?.message || 'Failed to move asset.';
      setDeskMoveError(message);
    }
  };

  const issueComplete = async (issue) => {
    await updateAssetIssueStatus(issue.id, {
      status: 'resolved',
      close_issue: true,
      resolution_notes: 'Marked resolved from asset management'
    });
    await load();
  };

  const tabs = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'desks', label: 'Desk Map' },
    { key: 'assets', label: 'Assets' },
    { key: 'warranties', label: 'Warranty Tracker' },
    { key: 'issues', label: 'Issues' },
    { key: 'repairs', label: 'Repairs' },
    { key: 'replacements', label: 'Replacement' },
    { key: 'movements', label: 'Movements' },
    { key: 'stock', label: 'Stock Room' }
  ];

  const assetStatusOptions = useMemo(() => {
    const unique = new Set(
      assets
        .map((asset) => String(asset.status || '').trim())
        .filter(Boolean)
    );
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [assets]);

  const filteredAssets = useMemo(() => (
    assets.filter((asset) => {
      const officeMatch = assetOfficeFilter === 'all' || String(asset.office_id) === String(assetOfficeFilter);
      const categoryMatch = assetCategoryFilter === 'all' || String(asset.category_id) === String(assetCategoryFilter);
      const statusMatch = assetStatusFilter === 'all' || String(asset.status) === String(assetStatusFilter);
      return officeMatch && categoryMatch && statusMatch;
    })
  ), [assets, assetOfficeFilter, assetCategoryFilter, assetStatusFilter]);

  const filteredAssetSummary = useMemo(() => ({
    active: filteredAssets.filter((asset) => String(asset.status || '').toLowerCase() === 'active').length,
    warrantySoon: filteredAssets.filter((asset) => {
      const raw = String(asset.warranty_end_date || '').trim();
      if (!raw) return false;
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return false;
      const now = new Date();
      const in30Days = new Date();
      in30Days.setDate(now.getDate() + 30);
      return date >= now && date <= in30Days;
    }).length,
    assigned: filteredAssets.filter((asset) => asset.desk_id || asset.assigned_user_id).length
  }), [filteredAssets]);

  const deskCards = useMemo(() => {
    const query = deskSearch.trim().toLowerCase();
    return (masters.desks || []).filter((desk) => {
      const officeMatch = deskOfficeFilter === 'all' || String(desk.office_id) === String(deskOfficeFilter);
      if (!officeMatch) return false;
      if (!query) return true;
      const haystack = [
        desk.office_name,
        desk.office_code,
        desk.desk_no,
        desk.desk_label,
        desk.official_email,
        desk.assigned_user_name,
        desk.assigned_user_email,
        desk.assigned_user_designation,
        desk.assigned_user_department,
        desk.floor_label
      ].map((value) => String(value || '').toLowerCase()).join(' ');
      return haystack.includes(query);
    });
  }, [deskOfficeFilter, deskSearch, masters.desks]);

  const deskFloorOptions = useMemo(() => {
    const unique = new Set();
    deskCards.forEach((desk) => unique.add(getDeskFloorLabel(desk)));
    return Array.from(unique).sort((a, b) => {
      const floorDiff = floorSortKey(a) - floorSortKey(b);
      if (floorDiff !== 0) return floorDiff;
      return a.localeCompare(b);
    });
  }, [deskCards]);

  const officeMetaById = useMemo(() => {
    const map = new Map();
    (masters.offices || []).forEach((office) => {
      const parsedSortOrder = Number(office?.sort_order);
      map.set(String(office.id), {
        office_type: String(office?.office_type || 'branch_office').toLowerCase(),
        office_code: String(office?.code || '').toUpperCase(),
        sort_order: Number.isFinite(parsedSortOrder) ? parsedSortOrder : 999,
        office_name: String(office?.name || '')
      });
    });
    return map;
  }, [masters.offices]);

  const selectedDesk = useMemo(
    () => (masters.desks || []).find((desk) => String(desk.id) === String(selectedDeskId)) || null,
    [masters.desks, selectedDeskId]
  );
  const selectedDeskOffice = useMemo(
    () => masters.offices.find((office) => String(office.id) === String(deskForm.office_id)) || null,
    [masters.offices, deskForm.office_id]
  );

  const selectedDeskAssets = useMemo(
    () => assets.filter((asset) => String(asset.desk_id) === String(selectedDeskId)),
    [assets, selectedDeskId]
  );

  const selectedDeskStockItems = useMemo(
    () => stockItems.filter((item) => String(item.desk_id) === String(selectedDeskId)),
    [stockItems, selectedDeskId]
  );

  const deskMoveDestinationDesks = useMemo(() => (
    (masters.desks || []).filter((desk) => {
      if (String(desk.id) === String(selectedDeskId)) return false;
      if (!deskMoveForm.to_office_id) return true;
      return String(desk.office_id) === String(deskMoveForm.to_office_id);
    })
  ), [masters.desks, selectedDeskId, deskMoveForm.to_office_id]);

  useEffect(() => {
    const loadDeskHistory = async () => {
      if (!selectedDeskId) {
        setDeskHistory([]);
        return;
      }
      try {
        const history = await getAssetDeskHistory(selectedDeskId);
        setDeskHistory(Array.isArray(history) ? history : []);
      } catch (error) {
        console.error('[AssetManagement] getAssetDeskHistory:', error);
        setDeskHistory([]);
      }
    };

    loadDeskHistory();
  }, [selectedDeskId]);

  useEffect(() => {
    if (deskFloorFilter === 'all') return;
    if (!deskFloorOptions.includes(deskFloorFilter)) {
      setDeskFloorFilter('all');
    }
  }, [deskFloorFilter, deskFloorOptions]);

  const deskGroups = useMemo(() => {
    const byGroup = new Map();

    deskCards.forEach((desk) => {
      const floorLabel = getDeskFloorLabel(desk);
      if (deskFloorFilter !== 'all' && floorLabel !== deskFloorFilter) return;

      const officeMeta = officeMetaById.get(String(desk.office_id));
      const officeType = officeMeta?.office_type === 'head_office' || String(desk.office_code || '').toUpperCase() === 'HQ'
        ? 'head_office'
        : 'branch_office';
      const key = `${desk.office_id}:${floorLabel}`;
      if (!byGroup.has(key)) {
        byGroup.set(key, {
          office_id: desk.office_id,
          office_name: officeMeta?.office_name || desk.office_name,
          office_code: officeMeta?.office_code || desk.office_code,
          office_sort_order: officeMeta?.sort_order ?? 999,
          office_type: officeType,
          floor_label: floorLabel,
          desks: []
        });
      }
      byGroup.get(key).desks.push(desk);
    });

    const groups = Array.from(byGroup.values()).map((group) => ({
      ...group,
      desks: [...group.desks].sort((a, b) => {
        const deskNoDiff = getDeskNoSortValue(a?.desk_no) - getDeskNoSortValue(b?.desk_no);
        if (deskNoDiff !== 0) return deskNoDiff;
        return String(a?.desk_no || '').localeCompare(String(b?.desk_no || ''));
      })
    }));

    return groups.sort((a, b) => {
      if (a.office_type !== b.office_type) {
        return a.office_type === 'head_office' ? -1 : 1;
      }
      const sortOrderDiff = (a.office_sort_order ?? 999) - (b.office_sort_order ?? 999);
      if (sortOrderDiff !== 0) return sortOrderDiff;
      const officeDiff = String(a.office_name || '').localeCompare(String(b.office_name || ''));
      if (officeDiff !== 0) return officeDiff;
      return floorSortKey(a.floor_label) - floorSortKey(b.floor_label);
    });
  }, [deskCards, deskFloorFilter, officeMetaById]);

  const deskSections = useMemo(() => {
    const headOfficeGroups = deskGroups.filter((group) => group.office_type === 'head_office');
    const branchOfficeGroups = deskGroups.filter((group) => group.office_type !== 'head_office');

    return [
      {
        key: 'head',
        label: 'Head Office',
        subtitle: 'HQ desks together',
        groups: headOfficeGroups
      },
      {
        key: 'branch',
        label: 'Branch Offices',
        subtitle: 'All branches grouped together',
        groups: branchOfficeGroups
      }
    ].filter((section) => section.groups.length);
  }, [deskGroups]);

  const renderDeskTab = () => (
    <div className="row g-4">
      <div className="col-lg-8">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div>
              <div className="fw-bold">Desk Map</div>
              <div className="text-muted small">Filter by office and floor, then click a desk to inspect occupant, assets, and stock items.</div>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <input
                className="form-control form-control-sm"
                style={{ minWidth: 200 }}
                value={deskSearch}
                onChange={(e) => setDeskSearch(e.target.value)}
                placeholder="Search desk, email, or person"
              />
              <select className="form-select form-select-sm" style={{ minWidth: 180 }} value={deskOfficeFilter} onChange={(e) => setDeskOfficeFilter(e.target.value)}>
                <option value="all">All offices</option>
                {masters.offices.map((office) => (
                  <option key={office.id} value={office.id}>{office.name}</option>
                ))}
              </select>
              <select className="form-select form-select-sm" style={{ minWidth: 180 }} value={deskFloorFilter} onChange={(e) => setDeskFloorFilter(e.target.value)}>
                <option value="all">All floors</option>
                {deskFloorOptions.map((floor) => (
                  <option key={floor} value={floor}>{floor}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="card-body desk-map-body">
            <div className="desk-layout-summary">
              <div><strong>{deskGroups.reduce((count, group) => count + group.desks.length, 0)}</strong><span>Visible desks</span></div>
              <div><strong>{deskGroups.reduce((count, group) => count + group.desks.filter((desk) => desk.assigned_user_id).length, 0)}</strong><span>Assigned</span></div>
              <div><strong>{deskGroups.reduce((count, group) => count + group.desks.filter((desk) => !desk.assigned_user_id).length, 0)}</strong><span>Open</span></div>
              <div><strong>{deskFloorFilter === 'all' ? deskFloorOptions.length : 1}</strong><span>Floors</span></div>
            </div>
            {deskSections.map((section) => (
              <div key={section.key} className={`desk-zone desk-zone-${section.key}`}>
                <div className="desk-zone-title mb-3">
                  <span>{section.label} <small>{section.subtitle}</small></span>
                  <span>{section.groups.reduce((count, group) => count + group.desks.length, 0)} desks</span>
                </div>
                {section.groups.map((group) => (
                  <div key={`${section.key}-${group.office_id}-${group.floor_label}`} className="mb-4">
                    <div className="desk-office-title mb-3">
                      <span>{group.office_name} <small>{group.floor_label}</small></span>
                      <span>{group.desks.length} desks</span>
                    </div>
                    <div className="desk-grid">
                      {group.desks.map((desk) => {
                        const isSelected = String(selectedDeskId) === String(desk.id);
                        const hasOccupant = Boolean(desk.assigned_user_id);
                        return (
                          <button
                            key={desk.id}
                            type="button"
                            className={`desk-card ${isSelected ? 'desk-card-selected' : ''}`}
                            onClick={() => openDeskDetail(desk)}
                          >
                            <div className="desk-card-top">
                              <span className="desk-no">Desk {desk.desk_no}</span>
                              <span className={`desk-pill ${hasOccupant ? 'desk-pill-assigned' : 'desk-pill-empty'}`}>
                                {hasOccupant ? 'Assigned' : 'Open'}
                              </span>
                            </div>
                            <div className="desk-card-name">{getDeskUserName(desk)}</div>
                            <div className="desk-card-meta">{getDeskRoleLabel(desk)}</div>
                            <div className="desk-card-email">{desk.official_email || '-'}</div>
                            <div className="desk-card-stats">
                              <span>{desk.asset_count || 0} assets</span>
                              <span>{desk.stock_count || 0} stock</span>
                              <span>{desk.issue_count || 0} issues</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {!deskGroups.length && !loading && (
              <div className="text-muted text-center py-5">No desk records found for the selected office/floor filter.</div>
            )}
          </div>
        </div>
      </div>

      <div className="col-lg-4">
        <div className="card shadow-sm h-100 desk-detail-shell">
          <div className="card-header bg-white fw-bold">Desk Details</div>
          <div className="card-body">
            {!selectedDesk ? (
              <div className="text-muted">
                Click a desk card to see the current occupant, linked portal user, and items on that desk.
              </div>
            ) : (
              <div className="d-grid gap-3">
                <div className="desk-detail-hero">
                  <div className="desk-detail-no">Desk {selectedDesk.desk_no}</div>
                  <div className="desk-detail-office">
                    {selectedDesk.office_name}
                    {getDeskFloorLabel(selectedDesk) !== 'Main Area' ? ` - ${getDeskFloorLabel(selectedDesk)}` : ''}
                  </div>
                  <div className="desk-detail-user">
                    {getDeskOccupantLabel(selectedDesk)}
                  </div>
                  <div className="desk-detail-email">{selectedDesk.official_email || 'No official email set'}</div>
                </div>

                <div className="desk-detail-summary">
                  <div><strong>{selectedDesk.asset_count || 0}</strong><span>Assets</span></div>
                  <div><strong>{selectedDesk.stock_count || 0}</strong><span>Stock</span></div>
                  <div><strong>{selectedDesk.issue_count || 0}</strong><span>Issues</span></div>
                </div>

                <form className="d-grid gap-3" onSubmit={submitDeskAssignment}>
                  <select className={inputClass} value={deskForm.office_id} onChange={(e) => setDeskForm((prev) => ({ ...prev, office_id: e.target.value }))}>
                    <option value="">Office</option>
                    {masters.offices.map((office) => (
                      <option key={office.id} value={office.id}>{office.name}</option>
                    ))}
                  </select>
                  <select className={inputClass} value={deskForm.assigned_user_id} onChange={(e) => setDeskForm((prev) => ({ ...prev, assigned_user_id: e.target.value }))}>
                    <option value="">Assign portal user</option>
                    {masters.users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.full_name}
                        {user.designation ? ` - ${user.designation}` : ''}
                        {user.department ? ` (${user.department})` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedDeskOffice?.code === 'HQ' ? (
                    <select className={inputClass} value={deskForm.floor_label || ''} onChange={(e) => setDeskForm((prev) => ({ ...prev, floor_label: e.target.value }))}>
                      <option value="">Select floor</option>
                      <option value="Ground Floor">Ground Floor</option>
                      <option value="1st Floor">1st Floor</option>
                    </select>
                  ) : (
                    <div className="small text-muted">Floor assignment is only applicable for Head Office desks.</div>
                  )}
                  <input className={inputClass} value={deskForm.desk_label} placeholder="Desk label / occupant name" onChange={(e) => setDeskForm((prev) => ({ ...prev, desk_label: e.target.value }))} />
                  <input className={inputClass} value={deskForm.official_email} placeholder="Official email" onChange={(e) => setDeskForm((prev) => ({ ...prev, official_email: e.target.value }))} />
                  <textarea className={inputClass} rows="2" value={deskForm.location_note} placeholder="Location note" onChange={(e) => setDeskForm((prev) => ({ ...prev, location_note: e.target.value }))} />
                  <button className="btn btn-primary" type="submit" disabled={deskAssignmentSaving}>
                    {deskAssignmentSaving ? 'Saving...' : 'Save Desk Assignment'}
                  </button>
                  {deskAssignmentStatus && (
                    <div className={deskAssignmentStatus.type === 'error' ? 'small text-danger' : 'small text-success'}>
                      {deskAssignmentStatus.message}
                    </div>
                  )}
                </form>

                <div className="desk-detail-list">
                  <div className="desk-detail-list-title">Assets on this desk</div>
                  {selectedDeskAssets.length ? selectedDeskAssets.map((asset) => (
                    <div key={asset.id} className="desk-detail-item">
                      <div>
                        <div className="fw-semibold">{asset.asset_name}</div>
                        <div className="small text-muted">{asset.asset_tag} {asset.serial_number ? `- ${asset.serial_number}` : ''}</div>
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <span className="badge bg-info-subtle text-info-emphasis">{asset.status}</span>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => openDeskMoveModal(asset.id)}
                        >
                          Move
                        </button>
                      </div>
                    </div>
                  )) : <div className="text-muted small">No assets linked to this desk.</div>}
                </div>

                <div className="desk-detail-list">
                  <div className="desk-detail-list-title">Move asset from this desk</div>
                  <div className="small text-muted mb-3">
                    Use transfer modal for cleaner routing between offices/desks with validation.
                  </div>
                  <button type="button" className="btn btn-outline-primary" onClick={() => openDeskMoveModal()}>
                    Open Transfer Modal
                  </button>
                </div>

                <div className="desk-detail-list">
                  <div className="desk-detail-list-title">Stock items on this desk</div>
                  {selectedDeskStockItems.length ? selectedDeskStockItems.map((item) => (
                    <div key={item.id} className="desk-detail-item">
                      <div>
                        <div className="fw-semibold">{item.item_name}</div>
                        <div className="small text-muted">{item.item_code}</div>
                      </div>
                      <span className="badge bg-secondary-subtle text-secondary-emphasis">{item.quantity_on_hand}</span>
                    </div>
                  )) : <div className="text-muted small">No stock items linked to this desk.</div>}
                </div>

                <div className="desk-detail-list">
                  <div className="desk-detail-list-title">Assignment history</div>
                  {deskHistory.length ? deskHistory.map((entry) => (
                    <div key={entry.id} className="desk-history-item">
                      <div className="fw-semibold">
                        {entry.assigned_user_name || 'Unassigned'}
                      </div>
                      <div className="small text-muted">
                        {entry.assigned_user_email || entry.official_email || 'No email'}{entry.assigned_by_name ? ` - by ${entry.assigned_by_name}` : ''}
                      </div>
                      <div className="small text-muted">
                        {entry.notes || 'No notes'}{entry.created_at ? ` - ${new Date(entry.created_at).toLocaleString()}` : ''}
                      </div>
                    </div>
                  )) : <div className="text-muted small">No assignment history found.</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderAssetsTab = () => (
    <div className="card shadow-sm">
      <div className="card-header bg-white fw-bold d-flex justify-content-between align-items-center">
        <div>
          <div>Assets</div>
          <div className="text-muted small">Use Add Asset to register new devices with office/desk assignment.</div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="text-muted small">{filteredAssets.length} / {assets.length} records</span>
          <button type="button" className="btn btn-sm btn-primary" onClick={openAddAsset}>
            Add Asset
          </button>
        </div>
      </div>
      <div className="card-body border-bottom bg-light-subtle">
        <div className="row g-3 align-items-end">
          <div className="col-md-3">
            <label className="form-label small text-muted">Office</label>
            <select className="form-select" value={assetOfficeFilter} onChange={(e) => setAssetOfficeFilter(e.target.value)}>
              <option value="all">All offices</option>
              {masters.offices.map((office) => (
                <option key={office.id} value={office.id}>{office.name}</option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label small text-muted">Category</label>
            <select className="form-select" value={assetCategoryFilter} onChange={(e) => setAssetCategoryFilter(e.target.value)}>
              <option value="all">All categories</option>
              {masters.categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label small text-muted">Status</label>
            <select className="form-select" value={assetStatusFilter} onChange={(e) => setAssetStatusFilter(e.target.value)}>
              <option value="all">All status</option>
              {assetStatusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <div className="asset-inline-stats">
              <span><strong>{filteredAssetSummary.active}</strong> active</span>
              <span><strong>{filteredAssetSummary.assigned}</strong> assigned</span>
              <span><strong>{filteredAssetSummary.warrantySoon}</strong> expiring</span>
            </div>
          </div>
        </div>
      </div>
      <div className="table-responsive">
        <table className="table align-middle mb-0">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Category</th>
              <th>Components</th>
              <th>Location</th>
              <th>Vendor</th>
              <th>Warranty</th>
              <th>Status</th>
              <th>Condition</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAssets.map((asset) => (
              <tr key={asset.id}>
                <td>
                  <div className="fw-bold">{asset.asset_name}</div>
                  <div className="small text-muted">{asset.asset_tag} {asset.serial_number ? `- ${asset.serial_number}` : ''}</div>
                  <div className="small text-muted">{asset.brand || '-'} {asset.model ? `- ${asset.model}` : ''}</div>
                </td>
                <td>{asset.category_name || '-'}</td>
<td>
                  <span className="badge bg-primary-subtle text-primary-emphasis">{asset.component_count || 0}</span>
                </td>
                <td>
                  <div>{asset.office_name || '-'}</div>
                  <div className="small text-muted">{asset.desk_no ? `Desk ${asset.desk_no}` : '-'}</div>
                  {asset.desk_label && <div className="small text-info">{asset.desk_label}</div>}
                </td>
                <td>{asset.vendor_name || '-'}</td>
                <td>
                  <div>{asset.warranty_end_date || '-'}</div>
                  <div className="small text-muted">{asset.warranty_type || '-'}</div>
                </td>
                <td><span className="badge bg-secondary-subtle text-secondary-emphasis">{asset.status}</span></td>
                <td><span className="badge bg-info-subtle text-info-emphasis">{asset.condition}</span></td>
                <td>
                  <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => openAssetEdit(asset)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {!filteredAssets.length && !loading && (
              <tr>
                <td colSpan="9" className="text-muted text-center py-4">No assets found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderDashboardTab = () => (
    <div className="row g-4">
      <div className="col-lg-4">
        <QuickActionCard
          title="Asset Register"
          value={assets.length}
          hint="Search, filter, and update device records quickly."
          buttonLabel="Assets"
          onClick={() => setActiveTab('assets')}
          tone="primary"
        />
      </div>
      <div className="col-lg-4">
        <QuickActionCard
          title="Open Issues"
          value={issues.filter((issue) => String(issue.status || '').toLowerCase() !== 'resolved').length}
          hint="Jump straight to unresolved hardware issues and warranty claims."
          buttonLabel="Issues"
          onClick={() => setActiveTab('issues')}
          tone="danger"
        />
      </div>
      <div className="col-lg-4">
        <QuickActionCard
          title="Low Stock"
          value={stockItems.filter((item) => Number(item.quantity_on_hand || 0) <= Number(item.minimum_quantity || 0)).length}
          hint="See spare parts that need replenishment before stock-outs happen."
          buttonLabel="Stock"
          onClick={() => setActiveTab('stock')}
          tone="warning"
        />
      </div>
      <div className="col-lg-7">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white fw-bold d-flex justify-content-between align-items-center">
            <span>Assets by Office</span>
            <span className="text-muted small">Distribution</span>
          </div>
          <div className="table-responsive">
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Office</th>
                  <th>Assets</th>
                </tr>
              </thead>
              <tbody>
                {reports.assets_by_office.map((row) => (
                  <tr key={row.id}>
                    <td>{row.office_name}</td>
                    <td>{row.asset_count}</td>
                  </tr>
                ))}
                {!reports.assets_by_office.length && !loading && (
                  <tr><td colSpan="2" className="text-muted text-center py-4">No office data found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="col-lg-5">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white fw-bold">Asset Status</div>
          <div className="card-body">
            <div className="d-grid gap-2">
              {reports.asset_status_counts.map((row) => (
                <div key={row.status} className="d-flex justify-content-between border rounded-3 px-3 py-2">
                  <span className="text-capitalize">{row.status.replace(/_/g, ' ')}</span>
                  <strong>{row.count}</strong>
                </div>
              ))}
              {!reports.asset_status_counts.length && !loading && (
                <div className="text-muted text-center py-4">No status data found</div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="col-lg-6">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white fw-bold">Assets by Category</div>
          <div className="table-responsive">
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Assets</th>
                </tr>
              </thead>
              <tbody>
                {reports.assets_by_category.map((row) => (
                  <tr key={row.id}>
                    <td>{row.category_name}</td>
                    <td>{row.asset_count}</td>
                  </tr>
                ))}
                {!reports.assets_by_category.length && !loading && (
                  <tr><td colSpan="2" className="text-muted text-center py-4">No category data found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="col-lg-6">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white fw-bold">Vendor Spend</div>
          <div className="table-responsive">
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Assets</th>
                  <th>Spend</th>
                </tr>
              </thead>
              <tbody>
                {reports.vendor_spend.map((row) => (
                  <tr key={row.vendor_name}>
                    <td>{row.vendor_name}</td>
                    <td>{row.asset_count}</td>
                    <td>{row.total_spend}</td>
                  </tr>
                ))}
                {!reports.vendor_spend.length && !loading && (
                  <tr><td colSpan="3" className="text-muted text-center py-4">No vendor spend data found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="col-lg-6">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white fw-bold">Warranty Expiring Soon</div>
          <div className="table-responsive">
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Office</th>
                  <th>End Date</th>
                </tr>
              </thead>
              <tbody>
                {reports.warranty_soon_assets.map((row) => (
                  <tr key={`${row.asset_tag}-${row.warranty_end_date}`}>
                    <td>{row.asset_tag} - {row.asset_name}</td>
                    <td>{row.office_name || '-'}</td>
                    <td>{row.warranty_end_date || '-'}</td>
                  </tr>
                ))}
                {!reports.warranty_soon_assets.length && !loading && (
                  <tr><td colSpan="3" className="text-muted text-center py-4">No warranty alerts found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="col-lg-6">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white fw-bold">Low Stock Items</div>
          <div className="table-responsive">
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Min</th>
                </tr>
              </thead>
              <tbody>
                {reports.low_stock_items.map((row) => (
                  <tr key={`${row.item_code}-${row.item_name}`}>
                    <td>{row.item_name}</td>
                    <td>{row.quantity_on_hand}</td>
                    <td>{row.minimum_quantity}</td>
                  </tr>
                ))}
                {!reports.low_stock_items.length && !loading && (
                  <tr><td colSpan="3" className="text-muted text-center py-4">No low stock items</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="col-lg-6">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white fw-bold">Monthly Purchase Summary</div>
          <div className="table-responsive">
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Assets</th>
                  <th>Spend</th>
                </tr>
              </thead>
              <tbody>
                {reports.monthly_purchase_summary.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td>{row.asset_count}</td>
                    <td>{row.total_spend}</td>
                  </tr>
                ))}
                {!reports.monthly_purchase_summary.length && !loading && (
                  <tr><td colSpan="3" className="text-muted text-center py-4">No purchase data found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="col-lg-6">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white fw-bold">Repair Cost Summary</div>
          <div className="table-responsive">
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Repairs</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {reports.repair_cost_summary.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td>{row.repair_count}</td>
                    <td>{row.total_cost}</td>
                  </tr>
                ))}
                {!reports.repair_cost_summary.length && !loading && (
                  <tr><td colSpan="3" className="text-muted text-center py-4">No repair cost data found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="col-12">
        <div className="card shadow-sm">
          <div className="card-header bg-white fw-bold">Open Issues</div>
          <div className="table-responsive">
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Asset</th>
                  <th>Severity</th>
                  <th>Office</th>
                </tr>
              </thead>
              <tbody>
                {reports.open_issues.map((row) => (
                  <tr key={`${row.asset_tag}-${row.issue_title}`}>
                    <td>{row.issue_title}</td>
                    <td>{row.asset_tag} - {row.asset_name}</td>
                    <td>{row.severity}</td>
                    <td>{row.office_name || '-'}</td>
                  </tr>
                ))}
                {!reports.open_issues.length && !loading && (
                  <tr><td colSpan="4" className="text-muted text-center py-4">No open issues found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const renderWarrantyTab = () => (
    <div className="row g-4">
      <div className="col-lg-4">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white fw-bold">Add / Update Warranty</div>
          <div className="card-body">
            <form className="d-grid gap-3" onSubmit={submitWarranty}>
              <select className={inputClass} value={warrantyForm.asset_id} onChange={(e) => setWarrantyForm((prev) => ({ ...prev, asset_id: e.target.value }))}>
                <option value="">Select asset</option>
                {assetOptions.map((asset) => <option key={asset.id} value={asset.id}>{asset.asset_tag} - {asset.asset_name}</option>)}
              </select>
              <select className={inputClass} value={warrantyForm.vendor_id} onChange={(e) => setWarrantyForm((prev) => ({ ...prev, vendor_id: e.target.value }))}>
                <option value="">Vendor</option>
                {masters.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
              </select>
              <input className={inputClass} placeholder="Warranty type" value={warrantyForm.warranty_type} onChange={(e) => setWarrantyForm((prev) => ({ ...prev, warranty_type: e.target.value }))} />
              <input className={inputClass} type="date" value={warrantyForm.warranty_start_date} onChange={(e) => setWarrantyForm((prev) => ({ ...prev, warranty_start_date: e.target.value }))} />
              <input className={inputClass} type="date" value={warrantyForm.warranty_end_date} onChange={(e) => setWarrantyForm((prev) => ({ ...prev, warranty_end_date: e.target.value }))} />
              <textarea className={inputClass} rows="3" placeholder="Coverage notes" value={warrantyForm.coverage_notes} onChange={(e) => setWarrantyForm((prev) => ({ ...prev, coverage_notes: e.target.value }))} />
              <textarea className={inputClass} rows="2" placeholder="Notes" value={warrantyForm.notes} onChange={(e) => setWarrantyForm((prev) => ({ ...prev, notes: e.target.value }))} />
              <button className="btn btn-primary" type="submit">Save Warranty</button>
            </form>
          </div>
        </div>
      </div>
      <div className="col-lg-8">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white fw-bold d-flex justify-content-between align-items-center">
            <span>Warranty Tracker</span>
            <span className="text-muted small">{warranties.length} records</span>
          </div>
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Office</th>
                  <th>End Date</th>
                  <th>Status</th>
                  <th>Claims</th>
                </tr>
              </thead>
              <tbody>
                {warranties.map((warranty) => (
                  <tr key={warranty.id}>
                    <td>
                      <div className="fw-semibold">{warranty.asset_name}</div>
                      <div className="small text-muted">{warranty.asset_tag}</div>
                    </td>
                    <td>{warranty.office_name || '-'}</td>
                    <td>{warranty.warranty_end_date || '-'}</td>
                    <td><span className="badge bg-warning-subtle text-warning-emphasis">{warranty.computed_status}</span></td>
                    <td>{warranty.claim_count}</td>
                  </tr>
                ))}
                {!warranties.length && !loading && (
                  <tr><td colSpan="5" className="text-muted text-center py-4">No warranty records found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const renderIssuesTab = () => (
    <div className="row g-4">
      <div className="col-lg-4">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white fw-bold">Report Issue</div>
          <div className="card-body">
            <form className="d-grid gap-3" onSubmit={submitIssue}>
              <select className={inputClass} value={issueForm.asset_id} onChange={(e) => setIssueForm((prev) => ({ ...prev, asset_id: e.target.value }))}>
                <option value="">Select asset</option>
                {assetOptions.map((asset) => <option key={asset.id} value={asset.id}>{asset.asset_tag} - {asset.asset_name}</option>)}
              </select>
              <select className={inputClass} value={issueForm.office_id} onChange={(e) => setIssueForm((prev) => ({ ...prev, office_id: e.target.value }))}>
                <option value="">Office</option>
                {masters.offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
              </select>
              <select className={inputClass} value={issueForm.desk_id} onChange={(e) => setIssueForm((prev) => ({ ...prev, desk_id: e.target.value }))}>
                <option value="">Desk</option>
                {masters.desks.map((desk) => <option key={desk.id} value={desk.id}>Desk {desk.desk_no} - {desk.office_name}</option>)}
              </select>
              <input className={inputClass} placeholder="Issue title" value={issueForm.issue_title} onChange={(e) => setIssueForm((prev) => ({ ...prev, issue_title: e.target.value }))} />
              <textarea className={inputClass} rows="3" placeholder="Issue description" value={issueForm.issue_description} onChange={(e) => setIssueForm((prev) => ({ ...prev, issue_description: e.target.value }))} />
              <select className={inputClass} value={issueForm.severity} onChange={(e) => setIssueForm((prev) => ({ ...prev, severity: e.target.value }))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <label className="form-check d-flex align-items-center gap-2">
                <input className="form-check-input" type="checkbox" checked={issueForm.warranty_claimed} onChange={(e) => setIssueForm((prev) => ({ ...prev, warranty_claimed: e.target.checked }))} />
                <span className="form-check-label">Warranty claim required</span>
              </label>
              <button className="btn btn-primary" type="submit">Save Issue</button>
            </form>
          </div>
        </div>
      </div>
      <div className="col-lg-8">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white fw-bold d-flex justify-content-between align-items-center">
            <span>Issue Log</span>
            <span className="text-muted small">{issues.length} records</span>
          </div>
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Asset</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Claim</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id}>
                    <td>
                      <div className="fw-semibold">{issue.issue_title}</div>
                      <div className="small text-muted">{issue.issue_description || '-'}</div>
                    </td>
                    <td>
                      <div>{issue.asset_name}</div>
                      <div className="small text-muted">{issue.asset_tag}</div>
                    </td>
                    <td>{issue.severity}</td>
                    <td><span className="badge bg-info-subtle text-info-emphasis">{issue.status}</span></td>
                    <td>{issue.warranty_claimed ? 'Yes' : 'No'}</td>
                    <td>
                      {issue.status !== 'resolved' ? (
                        <button className="btn btn-sm btn-outline-success" onClick={() => issueComplete(issue)}>Mark resolved</button>
                      ) : (
                        <span className="text-success small">Resolved</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!issues.length && !loading && (
                  <tr><td colSpan="6" className="text-muted text-center py-4">No issues found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const renderRepairsTab = () => (
    <div className="row g-4">
      <div className="col-lg-4">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white fw-bold">Add Repair Log</div>
          <div className="card-body">
            <form className="d-grid gap-3" onSubmit={submitRepair}>
              <select className={inputClass} value={repairForm.asset_id} onChange={(e) => setRepairForm((prev) => ({ ...prev, asset_id: e.target.value }))}>
                <option value="">Select asset</option>
                {assetOptions.map((asset) => <option key={asset.id} value={asset.id}>{asset.asset_tag} - {asset.asset_name}</option>)}
              </select>
              <select className={inputClass} value={repairForm.issue_id} onChange={(e) => setRepairForm((prev) => ({ ...prev, issue_id: e.target.value }))}>
                <option value="">Issue (optional)</option>
                {issues.map((issue) => <option key={issue.id} value={issue.id}>#{issue.id} - {issue.issue_title}</option>)}
              </select>
              <select className={inputClass} value={repairForm.vendor_id} onChange={(e) => setRepairForm((prev) => ({ ...prev, vendor_id: e.target.value }))}>
                <option value="">Vendor</option>
                {masters.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
              </select>
              <input className={inputClass} placeholder="Technician name" value={repairForm.technician_name} onChange={(e) => setRepairForm((prev) => ({ ...prev, technician_name: e.target.value }))} />
              <textarea className={inputClass} rows="3" placeholder="Repair action" value={repairForm.repair_action} onChange={(e) => setRepairForm((prev) => ({ ...prev, repair_action: e.target.value }))} />
              <textarea className={inputClass} rows="2" placeholder="Parts used" value={repairForm.parts_used} onChange={(e) => setRepairForm((prev) => ({ ...prev, parts_used: e.target.value }))} />
              <input className={inputClass} type="number" step="0.01" placeholder="Repair cost" value={repairForm.repair_cost} onChange={(e) => setRepairForm((prev) => ({ ...prev, repair_cost: e.target.value }))} />
              <input className={inputClass} type="datetime-local" value={repairForm.started_at} onChange={(e) => setRepairForm((prev) => ({ ...prev, started_at: e.target.value }))} />
              <input className={inputClass} type="datetime-local" value={repairForm.completed_at} onChange={(e) => setRepairForm((prev) => ({ ...prev, completed_at: e.target.value }))} />
              <input className={inputClass} placeholder="Outcome" value={repairForm.outcome} onChange={(e) => setRepairForm((prev) => ({ ...prev, outcome: e.target.value }))} />
              <textarea className={inputClass} rows="2" placeholder="Notes" value={repairForm.notes} onChange={(e) => setRepairForm((prev) => ({ ...prev, notes: e.target.value }))} />
              <button className="btn btn-primary" type="submit">Save Repair</button>
            </form>
          </div>
        </div>
      </div>
      <div className="col-lg-8">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white fw-bold d-flex justify-content-between align-items-center">
            <span>Repair History</span>
            <span className="text-muted small">{repairs.length} records</span>
          </div>
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Repair Action</th>
                  <th>Vendor</th>
                  <th>Cost</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {repairs.map((repair) => (
                  <tr key={repair.id}>
                    <td>
                      <div className="fw-semibold">{repair.asset_name}</div>
                      <div className="small text-muted">{repair.asset_tag}</div>
                    </td>
                    <td>
                      <div>{repair.repair_action}</div>
                      <div className="small text-muted">{repair.parts_used || '-'}</div>
                    </td>
                    <td>{repair.vendor_name || '-'}</td>
                    <td>{repair.repair_cost}</td>
                    <td>{repair.outcome || '-'}</td>
                  </tr>
                ))}
                {!repairs.length && !loading && (
                  <tr><td colSpan="5" className="text-muted text-center py-4">No repair logs found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const renderReplacementTab = () => (
    <div className="row g-4">
      <div className="col-lg-4">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white fw-bold">Replacement Entry</div>
          <div className="card-body">
            <form className="d-grid gap-3" onSubmit={submitReplacement}>
              <select className={inputClass} value={replacementForm.old_asset_id} onChange={(e) => setReplacementForm((prev) => ({ ...prev, old_asset_id: e.target.value }))}>
                <option value="">Old asset</option>
                {assetOptions.map((asset) => <option key={asset.id} value={asset.id}>{asset.asset_tag} - {asset.asset_name}</option>)}
              </select>
              <select className={inputClass} value={replacementForm.new_asset_id} onChange={(e) => setReplacementForm((prev) => ({ ...prev, new_asset_id: e.target.value }))}>
                <option value="">New asset (optional)</option>
                {assetOptions.map((asset) => <option key={asset.id} value={asset.id}>{asset.asset_tag} - {asset.asset_name}</option>)}
              </select>
              <textarea className={inputClass} rows="3" placeholder="Replacement reason" value={replacementForm.replacement_reason} onChange={(e) => setReplacementForm((prev) => ({ ...prev, replacement_reason: e.target.value }))} />
              <input className={inputClass} placeholder="Disposal method" value={replacementForm.disposal_method} onChange={(e) => setReplacementForm((prev) => ({ ...prev, disposal_method: e.target.value }))} />
              <textarea className={inputClass} rows="2" placeholder="Notes" value={replacementForm.notes} onChange={(e) => setReplacementForm((prev) => ({ ...prev, notes: e.target.value }))} />
              <button className="btn btn-primary" type="submit">Save Replacement</button>
            </form>
          </div>
        </div>
      </div>
      <div className="col-lg-8">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white fw-bold d-flex justify-content-between align-items-center">
            <span>Replacement History</span>
            <span className="text-muted small">{replacements.length} records</span>
          </div>
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead>
                <tr>
                  <th>Old Asset</th>
                  <th>New Asset</th>
                  <th>Reason</th>
                  <th>Disposal</th>
                </tr>
              </thead>
              <tbody>
                {replacements.map((replacement) => (
                  <tr key={replacement.id}>
                    <td>
                      <div className="fw-semibold">{replacement.old_asset_name}</div>
                      <div className="small text-muted">{replacement.old_asset_tag}</div>
                    </td>
                    <td>
                      <div>{replacement.new_asset_name || '-'}</div>
                      <div className="small text-muted">{replacement.new_asset_tag || '-'}</div>
                    </td>
                    <td>{replacement.replacement_reason}</td>
                    <td>{replacement.disposal_method || '-'}</td>
                  </tr>
                ))}
                {!replacements.length && !loading && (
                  <tr><td colSpan="4" className="text-muted text-center py-4">No replacements found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const renderMovementsTab = () => (
    <div className="card shadow-sm">
      <div className="card-header bg-white fw-bold d-flex justify-content-between align-items-center">
        <span>Movement History</span>
        <span className="text-muted small">{movements.length} records</span>
      </div>
      <div className="table-responsive">
        <table className="table align-middle mb-0">
          <thead>
            <tr>
              <th>Asset</th>
              <th>From</th>
              <th>To</th>
              <th>Reason</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((movement) => (
              <tr key={movement.id}>
                <td>
                  <div className="fw-semibold">{movement.asset_name}</div>
                  <div className="small text-muted">{movement.asset_tag}</div>
                </td>
                <td>
                  <div>{movement.from_office_name || '-'}</div>
                  <div className="small text-muted">{movement.from_desk_no ? `Desk ${movement.from_desk_no}` : '-'}</div>
                </td>
                <td>
                  <div>{movement.to_office_name || '-'}</div>
                  <div className="small text-muted">{movement.to_desk_no ? `Desk ${movement.to_desk_no}` : '-'}</div>
                </td>
                <td>{movement.reason || '-'}</td>
                <td>{movement.moved_by_name || '-'}</td>
              </tr>
            ))}
            {!movements.length && !loading && (
              <tr><td colSpan="5" className="text-muted text-center py-4">No movement history found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderStockTab = () => (
    <div className="row g-4">
      <div className="col-lg-4">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white fw-bold">Add Stock Item</div>
          <div className="card-body">
            <form className="d-grid gap-3" onSubmit={submitStockItem}>
              <input className={inputClass} placeholder="Item code" value={stockItemForm.item_code} onChange={(e) => setStockItemForm((prev) => ({ ...prev, item_code: e.target.value }))} />
              <input className={inputClass} placeholder="Item name" value={stockItemForm.item_name} onChange={(e) => setStockItemForm((prev) => ({ ...prev, item_name: e.target.value }))} />
              <input className={inputClass} placeholder="Item type" value={stockItemForm.item_type} onChange={(e) => setStockItemForm((prev) => ({ ...prev, item_type: e.target.value }))} />
              <select className={inputClass} value={stockItemForm.category_id} onChange={(e) => setStockItemForm((prev) => ({ ...prev, category_id: e.target.value }))}>
                <option value="">Category</option>
                {masters.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <select className={inputClass} value={stockItemForm.vendor_id} onChange={(e) => setStockItemForm((prev) => ({ ...prev, vendor_id: e.target.value }))}>
                <option value="">Vendor</option>
                {masters.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
              </select>
              <select className={inputClass} value={stockItemForm.office_id} onChange={(e) => setStockItemForm((prev) => ({ ...prev, office_id: e.target.value }))}>
                <option value="">Office</option>
                {masters.offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
              </select>
              <select className={inputClass} value={stockItemForm.desk_id} onChange={(e) => setStockItemForm((prev) => ({ ...prev, desk_id: e.target.value }))}>
                <option value="">Desk</option>
                {masters.desks.map((desk) => <option key={desk.id} value={desk.id}>Desk {desk.desk_no} - {desk.office_name}</option>)}
              </select>
              <input className={inputClass} type="number" min="0" placeholder="Quantity on hand" value={stockItemForm.quantity_on_hand} onChange={(e) => setStockItemForm((prev) => ({ ...prev, quantity_on_hand: e.target.value }))} />
              <input className={inputClass} type="number" min="0" placeholder="Minimum quantity" value={stockItemForm.minimum_quantity} onChange={(e) => setStockItemForm((prev) => ({ ...prev, minimum_quantity: e.target.value }))} />
              <input className={inputClass} type="number" step="0.01" placeholder="Unit price" value={stockItemForm.unit_price} onChange={(e) => setStockItemForm((prev) => ({ ...prev, unit_price: e.target.value }))} />
              <input className={inputClass} placeholder="Serial number" value={stockItemForm.serial_number} onChange={(e) => setStockItemForm((prev) => ({ ...prev, serial_number: e.target.value }))} />
              <select className={inputClass} value={stockItemForm.status} onChange={(e) => setStockItemForm((prev) => ({ ...prev, status: e.target.value }))}>
                <option value="available">Available</option>
                <option value="reserved">Reserved</option>
                <option value="out_of_stock">Out of stock</option>
              </select>
              <textarea className={inputClass} rows="2" placeholder="Notes" value={stockItemForm.notes} onChange={(e) => setStockItemForm((prev) => ({ ...prev, notes: e.target.value }))} />
              <button className="btn btn-primary" type="submit">Save Stock Item</button>
            </form>
          </div>
        </div>
      </div>
      <div className="col-lg-8">
        <div className="card shadow-sm h-100 mb-4">
          <div className="card-header bg-white fw-bold d-flex justify-content-between align-items-center">
            <span>Stock Inventory</span>
            <span className="text-muted small">{stockItems.length} items</span>
          </div>
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead>
                <tr>
                  <th>Item</th>
              <th>Qty</th>
              <th>Min</th>
              <th>Office</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
                {stockItems.map((item) => (
                  <tr key={item.id}>
<td>
                  <div>{asset.office_name || '-'}</div>
                  <div className="small text-muted">{asset.desk_no ? `Desk ${asset.desk_no}` : '-'}</div>
                  {asset.desk_label && <div className="small text-info">{asset.desk_label}</div>}
                </td>
                    <td>{item.quantity_on_hand}</td>
                    <td>{item.minimum_quantity}</td>
                    <td>{item.office_name || '-'}</td>
                    <td><span className="badge bg-secondary-subtle text-secondary-emphasis">{item.stock_status}</span></td>
                    <td>
                      <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => openStockEdit(item)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {!stockItems.length && !loading && (
                  <tr><td colSpan="6" className="text-muted text-center py-4">No stock items found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white fw-bold">Stock Movement</div>
          <div className="card-body">
            <form className="row g-3" onSubmit={submitStockMovement}>
              <div className="col-md-4">
                <select className={inputClass} value={stockMovementForm.stock_item_id} onChange={(e) => setStockMovementForm((prev) => ({ ...prev, stock_item_id: e.target.value }))}>
                  <option value="">Stock item</option>
                  {stockItems.map((item) => <option key={item.id} value={item.id}>{item.item_name}</option>)}
                </select>
              </div>
              <div className="col-md-4">
                <select className={inputClass} value={stockMovementForm.movement_type} onChange={(e) => setStockMovementForm((prev) => ({ ...prev, movement_type: e.target.value }))}>
                  <option value="received">Received</option>
                  <option value="issued">Issued</option>
                  <option value="adjusted">Adjusted</option>
                  <option value="returned">Returned</option>
                </select>
              </div>
              <div className="col-md-4">
                <input className={inputClass} type="number" placeholder="Quantity change e.g. 5 or -2" value={stockMovementForm.quantity_change} onChange={(e) => setStockMovementForm((prev) => ({ ...prev, quantity_change: e.target.value }))} />
              </div>
              <div className="col-md-6">
                <select className={inputClass} value={stockMovementForm.to_office_id} onChange={(e) => setStockMovementForm((prev) => ({ ...prev, to_office_id: e.target.value }))}>
                  <option value="">To office</option>
                  {masters.offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <select className={inputClass} value={stockMovementForm.to_desk_id} onChange={(e) => setStockMovementForm((prev) => ({ ...prev, to_desk_id: e.target.value }))}>
                  <option value="">To desk</option>
                  {masters.desks.map((desk) => <option key={desk.id} value={desk.id}>Desk {desk.desk_no} - {desk.office_name}</option>)}
                </select>
              </div>
              <div className="col-12">
                <input className={inputClass} placeholder="Reason" value={stockMovementForm.reason} onChange={(e) => setStockMovementForm((prev) => ({ ...prev, reason: e.target.value }))} />
              </div>
              <div className="col-12">
                <textarea className={inputClass} rows="2" placeholder="Notes" value={stockMovementForm.notes} onChange={(e) => setStockMovementForm((prev) => ({ ...prev, notes: e.target.value }))} />
              </div>
              <div className="col-12">
                <button className="btn btn-primary" type="submit">Save Stock Movement</button>
              </div>
            </form>
          </div>
        </div>
        <div className="card shadow-sm h-100 mt-4">
          <div className="card-header bg-white fw-bold d-flex justify-content-between align-items-center">
            <span>Stock Movements</span>
            <span className="text-muted small">{stockMovements.length} records</span>
          </div>
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Change</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {stockMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{movement.item_name}</td>
                    <td>{movement.quantity_change}</td>
                    <td>
                      <div>{movement.from_office_name || '-'}</div>
                      <div className="small text-muted">{movement.from_desk_no ? `Desk ${movement.from_desk_no}` : '-'}</div>
                    </td>
                    <td>
                      <div>{movement.to_office_name || '-'}</div>
                      <div className="small text-muted">{movement.to_desk_no ? `Desk ${movement.to_desk_no}` : '-'}</div>
                    </td>
                    <td>{movement.reason || '-'}</td>
                  </tr>
                ))}
                {!stockMovements.length && !loading && (
                  <tr><td colSpan="5" className="text-muted text-center py-4">No stock movements found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDeskMoveModal = () => {
    if (!selectedDesk) return null;
    const destinationDesk = (masters.desks || []).find((desk) => String(desk.id) === String(deskMoveForm.to_desk_id));
    const selectedAsset = selectedDeskAssets.find((asset) => String(asset.id) === String(deskMoveForm.asset_id));

    return (
      <div className="asset-modal-overlay position-fixed top-0 start-0 w-100 h-100" style={{ zIndex: 1090, background: 'rgba(15, 23, 42, 0.6)' }}>
        <div className="container h-100 d-flex align-items-center justify-content-center py-4">
          <div className="asset-modal-shell bg-white shadow-lg w-100 desk-transfer-modal" style={{ maxWidth: 760 }}>
            <div className="d-flex justify-content-between align-items-center border-bottom px-4 py-3">
              <div>
                <div className="fw-bold fs-5">Desk Transfer</div>
                <div className="text-muted small">Move asset from Desk {selectedDesk.desk_no} with destination filtering and validation.</div>
              </div>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={closeDeskMoveModal}>Close</button>
            </div>
            <form className="p-4 d-grid gap-3" onSubmit={submitDeskAssetMove}>
              <div className="desk-transfer-from">
                <div className="small text-muted text-uppercase fw-semibold">From</div>
                <div className="fw-semibold">{selectedDesk.office_name} - Desk {selectedDesk.desk_no}</div>
                <div className="small text-muted">{selectedDesk.assigned_user_name || selectedDesk.desk_label || 'Unassigned desk'}</div>
              </div>
              <select className={inputClass} value={deskMoveForm.asset_id} onChange={(e) => setDeskMoveForm((prev) => ({ ...prev, asset_id: e.target.value }))}>
                <option value="">Select asset</option>
                {selectedDeskAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>{asset.asset_name} ({asset.asset_tag})</option>
                ))}
              </select>
              <div className="row g-3">
                <div className="col-md-6">
                  <select
                    className={inputClass}
                    value={deskMoveForm.to_office_id}
                    onChange={(e) => setDeskMoveForm((prev) => ({ ...prev, to_office_id: e.target.value, to_desk_id: '' }))}
                  >
                    <option value="">Destination office</option>
                    {masters.offices.map((office) => (
                      <option key={office.id} value={office.id}>{office.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6">
                  <select className={inputClass} value={deskMoveForm.to_desk_id} onChange={(e) => setDeskMoveForm((prev) => ({ ...prev, to_desk_id: e.target.value }))}>
                    <option value="">Destination desk</option>
                    {deskMoveDestinationDesks.map((desk) => (
                      <option key={desk.id} value={desk.id}>
                        Desk {desk.desk_no} - {desk.office_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <input
                className={inputClass}
                placeholder="Move reason"
                value={deskMoveForm.reason}
                onChange={(e) => setDeskMoveForm((prev) => ({ ...prev, reason: e.target.value }))}
              />
              {deskMoveError && <div className="desk-transfer-error">{deskMoveError}</div>}
              <div className="desk-transfer-preview small text-muted">
                {selectedAsset ? `Asset: ${selectedAsset.asset_name} (${selectedAsset.asset_tag})` : 'Asset not selected'}
                {destinationDesk ? ` -> Destination: ${destinationDesk.office_name}, Desk ${destinationDesk.desk_no}` : ' -> Destination not selected'}
              </div>
              <div className="d-flex justify-content-end gap-2">
                <button type="button" className="btn btn-outline-secondary" onClick={closeDeskMoveModal}>Cancel</button>
                <button type="submit" className="btn btn-primary">Confirm Transfer</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  };

  const renderEditModal = () => {
    const isAsset = Boolean(editingAsset || creatingAsset);
    const title = isAsset
      ? (creatingAsset ? 'Add New Asset' : `Edit Asset ${editingAsset?.asset_tag || ''}`)
      : `Edit Stock Item ${editingStockItem?.item_code || ''}`;
    const onClose = closeEdit;
    const onSubmit = isAsset ? (creatingAsset ? submitAssetCreate : submitAssetEdit) : submitStockEdit;
    const formState = isAsset ? assetEditForm : stockEditForm;
    const setFormState = isAsset ? setAssetEditForm : setStockEditForm;
    const submitLabel = isAsset ? (creatingAsset ? 'Create Asset' : 'Save Asset') : 'Save Stock Item';

    return (
      <div className="asset-modal-overlay position-fixed top-0 start-0 w-100 h-100" style={{ zIndex: 1080, background: 'rgba(15, 23, 42, 0.55)' }}>
        <div className="container h-100 d-flex align-items-center justify-content-center py-4">
          <div className="asset-modal-shell bg-white shadow-lg w-100" style={{ maxWidth: 860 }}>
            <div className="d-flex justify-content-between align-items-center border-bottom px-4 py-3">
              <div>
                <div className="fw-bold fs-5">{title}</div>
                <div className="text-muted small">Update the record and save without leaving the module.</div>
              </div>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>Close</button>
            </div>
<form onSubmit={onSubmit} className="p-4">
              {isAsset ? (
                <div className="row g-3">
                  <div className="col-12"><div className="fw-bold text-primary pb-2 border-bottom">Basic Information</div></div>
                  <div className="col-md-4"><label className="form-label small text-muted">Asset Tag</label><input className={inputClass} placeholder="SN-LAPTOP-001" value={formState.asset_tag} onChange={(e) => setFormState((prev) => ({ ...prev, asset_tag: e.target.value }))} /></div>
                  <div className="col-md-8"><label className="form-label small text-muted">Asset Name</label><input className={inputClass} placeholder="Dell XPS 15 Laptop" value={formState.asset_name} onChange={(e) => setFormState((prev) => ({ ...prev, asset_name: e.target.value }))} /></div>
                  <div className="col-md-4"><label className="form-label small text-muted">Category</label>
                    <select className={inputClass} value={formState.category_id} onChange={(e) => setFormState((prev) => ({ ...prev, category_id: e.target.value }))}>
                      <option value="">Select Category</option>
                      {masters.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </div>
                  <div className="col-md-4"><label className="form-label small text-muted">Vendor</label>
                    <select className={inputClass} value={formState.vendor_id} onChange={(e) => setFormState((prev) => ({ ...prev, vendor_id: e.target.value }))}>
                      <option value="">Select Vendor</option>
                      {masters.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
                    </select>
                  </div>
                  <div className="col-md-4"><label className="form-label small text-muted">Status</label>
                    <select className={inputClass} value={formState.status} onChange={(e) => setFormState((prev) => ({ ...prev, status: e.target.value }))}>
                      <option value="in_stock">In Stock</option>
                      <option value="active">Active</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="repair">Under Repair</option>
                      <option value="broken">Broken</option>
                      <option value="replaced">Replaced</option>
                    </select>
                  </div>
                  <div className="col-12"><div className="fw-bold text-primary py-2 border-bottom">Location & Assignment</div></div>
                  <div className="col-md-4"><label className="form-label small text-muted">Office</label>
                    <select className={inputClass} value={formState.office_id} onChange={(e) => setFormState((prev) => ({ ...prev, office_id: e.target.value, desk_id: '' }))}>
                      <option value="">Select Office</option>
                      {masters.offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
                    </select>
                  </div>
                  <div className="col-md-4"><label className="form-label small text-muted">Desk</label>
                    <select className={inputClass} value={formState.desk_id} onChange={(e) => setFormState((prev) => ({ ...prev, desk_id: e.target.value }))}>
                      <option value="">Select Desk</option>
                      {masters.desks
                        .filter((desk) => !formState.office_id || String(desk.office_id) === String(formState.office_id))
                        .map((desk) => <option key={desk.id} value={desk.id}>
                          {desk.desk_no}{desk.floor_label ? ` (${desk.floor_label})` : ''} - {desk.office_code}
{desk.desk_label ? ` → ${desk.desk_label}` : desk.assigned_user_name ? ` → ${desk.assigned_user_name.split(' ')[0]}` : ''}
                        </option>)}
                    </select>
                  </div>
                  <div className="col-md-4"><label className="form-label small text-muted">Assigned To</label>
                    <select className={inputClass} value={formState.assigned_user_id} onChange={(e) => setFormState((prev) => ({ ...prev, assigned_user_id: e.target.value }))}>
                      <option value="">Select User</option>
                      {masters.users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.full_name}{user.designation ? ` - ${user.designation}` : ''}{user.department ? ` (${user.department})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12"><div className="fw-bold text-primary py-2 border-bottom">Hardware Details</div></div>
                  <div className="col-md-4"><label className="form-label small text-muted">Brand</label><input className={inputClass} placeholder="Dell" value={formState.brand} onChange={(e) => setFormState((prev) => ({ ...prev, brand: e.target.value }))} /></div>
                  <div className="col-md-4"><label className="form-label small text-muted">Model</label><input className={inputClass} placeholder="XPS 15 9520" value={formState.model} onChange={(e) => setFormState((prev) => ({ ...prev, model: e.target.value }))} /></div>
                  <div className="col-md-4"><label className="form-label small text-muted">Serial Number</label><input className={inputClass} placeholder="SN123456789" value={formState.serial_number} onChange={(e) => setFormState((prev) => ({ ...prev, serial_number: e.target.value }))} /></div>
                  <div className="col-12"><div className="fw-bold text-primary py-2 border-bottom">Purchase & Warranty</div></div>
                  <div className="col-md-4"><label className="form-label small text-muted">Purchase Date</label><input className={inputClass} type="date" value={formState.purchase_date} onChange={(e) => setFormState((prev) => ({ ...prev, purchase_date: e.target.value }))} /></div>
                  <div className="col-md-4"><label className="form-label small text-muted">Purchase Price (Tk)</label><input className={inputClass} type="number" step="0.01" placeholder="135000" value={formState.purchase_price} onChange={(e) => setFormState((prev) => ({ ...prev, purchase_price: e.target.value }))} /></div>
                  <div className="col-md-4"><label className="form-label small text-muted">Warranty Type</label><input className={inputClass} placeholder="Manufacturer (3 Years)" value={formState.warranty_type} onChange={(e) => setFormState((prev) => ({ ...prev, warranty_type: e.target.value }))} /></div>
                  <div className="col-md-4"><label className="form-label small text-muted">Warranty Start</label><input className={inputClass} type="date" value={formState.warranty_start_date} onChange={(e) => setFormState((prev) => ({ ...prev, warranty_start_date: e.target.value }))} /></div>
                  <div className="col-md-4"><label className="form-label small text-muted">Warranty End</label><input className={inputClass} type="date" value={formState.warranty_end_date} onChange={(e) => setFormState((prev) => ({ ...prev, warranty_end_date: e.target.value }))} /></div>
                  <div className="col-md-4"><label className="form-label small text-muted">Condition</label>
                    <select className={inputClass} value={formState.condition} onChange={(e) => setFormState((prev) => ({ ...prev, condition: e.target.value }))}>
                      <option value="good">Good</option>
                      <option value="fair">Fair</option>
                      <option value="poor">Poor</option>
                    </select>
                  </div>
                  <div className="col-12"><label className="form-label small text-muted">Notes</label><textarea className={inputClass} rows="3" placeholder="Additional notes about this asset..." value={formState.notes} onChange={(e) => setFormState((prev) => ({ ...prev, notes: e.target.value }))} /></div>
                  {!creatingAsset && editingAsset && (
                    <div className="col-12">
                      <div className="asset-component-shell">
                        <div className="asset-component-header">
                          <div>
                            <div className="fw-bold">PC Components & Replace Log</div>
                            <div className="small text-muted">Track each replaceable part for this asset.</div>
                          </div>
                          <span className="badge bg-primary-subtle text-primary-emphasis">{assetComponents.filter((item) => item.status === 'active').length} active</span>
                        </div>

                        <div className="row g-2 mt-1">
                          <div className="col-md-3"><input className={inputClass} placeholder="Type (RAM, SSD, PSU)" value={componentForm.component_type} onChange={(e) => setComponentForm((prev) => ({ ...prev, component_type: e.target.value }))} /></div>
                          <div className="col-md-3"><input className={inputClass} placeholder="Component name" value={componentForm.component_name} onChange={(e) => setComponentForm((prev) => ({ ...prev, component_name: e.target.value }))} /></div>
                          <div className="col-md-2"><input className={inputClass} placeholder="Brand" value={componentForm.brand} onChange={(e) => setComponentForm((prev) => ({ ...prev, brand: e.target.value }))} /></div>
                          <div className="col-md-2"><input className={inputClass} placeholder="Model" value={componentForm.model} onChange={(e) => setComponentForm((prev) => ({ ...prev, model: e.target.value }))} /></div>
                          <div className="col-md-2"><input className={inputClass} placeholder="Serial" value={componentForm.serial_number} onChange={(e) => setComponentForm((prev) => ({ ...prev, serial_number: e.target.value }))} /></div>
                          <div className="col-md-8"><input className={inputClass} placeholder="Specification" value={componentForm.specification} onChange={(e) => setComponentForm((prev) => ({ ...prev, specification: e.target.value }))} /></div>
                          <div className="col-md-4 d-grid"><button type="button" className="btn btn-outline-primary" disabled={componentBusy} onClick={submitAssetComponent}>{componentBusy ? 'Saving...' : 'Add Component'}</button></div>
                        </div>

                        <div className="row g-2 mt-1">
                          <div className="col-md-4">
                            <select
                              className={inputClass}
                              value={componentReplaceForm.component_id}
                              onChange={(e) => {
                                const selectedId = e.target.value;
                                const target = assetComponents.find((item) => String(item.id) === String(selectedId));
                                setComponentReplaceForm((prev) => ({
                                  ...prev,
                                  component_id: selectedId,
                                  component_type: target?.component_type || '',
                                  component_name: target?.component_name || '',
                                  brand: target?.brand || '',
                                  model: target?.model || '',
                                  specification: target?.specification || ''
                                }));
                              }}
                            >
                              <option value="">Select active component to replace</option>
                              {assetComponents
                                .filter((item) => item.status === 'active')
                                .map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.component_type} - {item.component_name} ({item.serial_number || 'no-serial'})
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div className="col-md-2"><input className={inputClass} placeholder="New Serial" value={componentReplaceForm.serial_number} onChange={(e) => setComponentReplaceForm((prev) => ({ ...prev, serial_number: e.target.value }))} /></div>
                          <div className="col-md-2"><input className={inputClass} placeholder="Brand" value={componentReplaceForm.brand} onChange={(e) => setComponentReplaceForm((prev) => ({ ...prev, brand: e.target.value }))} /></div>
                          <div className="col-md-2"><input className={inputClass} placeholder="Model" value={componentReplaceForm.model} onChange={(e) => setComponentReplaceForm((prev) => ({ ...prev, model: e.target.value }))} /></div>
                          <div className="col-md-2"><input className={inputClass} placeholder="Reason" value={componentReplaceForm.reason} onChange={(e) => setComponentReplaceForm((prev) => ({ ...prev, reason: e.target.value }))} /></div>
                          <div className="col-md-8"><input className={inputClass} placeholder="Notes" value={componentReplaceForm.notes} onChange={(e) => setComponentReplaceForm((prev) => ({ ...prev, notes: e.target.value }))} /></div>
                          <div className="col-md-4 d-grid"><button type="button" className="btn btn-outline-dark" disabled={componentBusy} onClick={submitComponentReplace}>{componentBusy ? 'Processing...' : 'Replace Selected Component'}</button></div>
                        </div>

                        {componentStatus && (
                          <div className={`small mt-2 ${componentStatus.type === 'error' ? 'text-danger' : 'text-success'}`}>
                            {componentStatus.message}
                          </div>
                        )}

                        <div className="table-responsive mt-3">
                          <table className="table table-sm align-middle mb-0">
                            <thead>
                              <tr>
                                <th>Type</th>
                                <th>Name</th>
                                <th>Serial</th>
                                <th>Status</th>
                                <th>Installed</th>
                              </tr>
                            </thead>
                            <tbody>
                              {assetComponents.map((item) => (
                                <tr key={item.id}>
                                  <td>{item.component_type}</td>
                                  <td>{item.component_name}</td>
                                  <td className="small text-muted">{item.serial_number || '-'}</td>
                                  <td><span className={`badge ${item.status === 'active' ? 'bg-success-subtle text-success-emphasis' : 'bg-secondary-subtle text-secondary-emphasis'}`}>{item.status}</span></td>
                                  <td className="small text-muted">{item.installed_at ? new Date(item.installed_at).toLocaleDateString() : '-'}</td>
                                </tr>
                              ))}
                              {!assetComponents.length && (
                                <tr><td colSpan="5" className="small text-muted text-center py-3">No components added yet.</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        <div className="asset-component-history mt-3">
                          <div className="fw-semibold small mb-1">Latest Component History</div>
                          {componentMovements.slice(0, 6).map((entry) => (
                            <div key={entry.id} className="small text-muted">
                              {new Date(entry.created_at).toLocaleString()} - {entry.movement_type}
                              {entry.from_component_name ? ` - from ${entry.from_component_name}` : ''}
                              {entry.to_component_name ? ` to ${entry.to_component_name}` : ''}
                              {entry.reason ? ` (${entry.reason})` : ''}
                            </div>
                          ))}
                          {!componentMovements.length && <div className="small text-muted">No component movement history.</div>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="row g-3">
                  <div className="col-md-4"><input className={inputClass} placeholder="Item code" value={formState.item_code} onChange={(e) => setFormState((prev) => ({ ...prev, item_code: e.target.value }))} /></div>
                  <div className="col-md-8"><input className={inputClass} placeholder="Item name" value={formState.item_name} onChange={(e) => setFormState((prev) => ({ ...prev, item_name: e.target.value }))} /></div>
                  <div className="col-md-4"><input className={inputClass} placeholder="Item type" value={formState.item_type} onChange={(e) => setFormState((prev) => ({ ...prev, item_type: e.target.value }))} /></div>
                  <div className="col-md-4">
                    <select className={inputClass} value={formState.category_id} onChange={(e) => setFormState((prev) => ({ ...prev, category_id: e.target.value }))}>
                      <option value="">Category</option>
                      {masters.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </div>
                  <div className="col-md-4">
                    <select className={inputClass} value={formState.vendor_id} onChange={(e) => setFormState((prev) => ({ ...prev, vendor_id: e.target.value }))}>
                      <option value="">Vendor</option>
                      {masters.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
                    </select>
                  </div>
                  <div className="col-md-4">
                    <select className={inputClass} value={formState.office_id} onChange={(e) => setFormState((prev) => ({ ...prev, office_id: e.target.value }))}>
                      <option value="">Office</option>
                      {masters.offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
                    </select>
                  </div>
                  <div className="col-md-4">
                    <select className={inputClass} value={formState.desk_id} onChange={(e) => setFormState((prev) => ({ ...prev, desk_id: e.target.value }))}>
                      <option value="">Desk</option>
                      {masters.desks.map((desk) => <option key={desk.id} value={desk.id}>Desk {desk.desk_no} - {desk.office_name}</option>)}
                    </select>
                  </div>
                  <div className="col-md-4"><input className={inputClass} type="number" min="0" placeholder="Quantity on hand" value={formState.quantity_on_hand} onChange={(e) => setFormState((prev) => ({ ...prev, quantity_on_hand: e.target.value }))} /></div>
                  <div className="col-md-4"><input className={inputClass} type="number" min="0" placeholder="Minimum quantity" value={formState.minimum_quantity} onChange={(e) => setFormState((prev) => ({ ...prev, minimum_quantity: e.target.value }))} /></div>
                  <div className="col-md-4"><input className={inputClass} type="number" step="0.01" placeholder="Unit price" value={formState.unit_price} onChange={(e) => setFormState((prev) => ({ ...prev, unit_price: e.target.value }))} /></div>
                  <div className="col-md-6"><input className={inputClass} placeholder="Serial number" value={formState.serial_number} onChange={(e) => setFormState((prev) => ({ ...prev, serial_number: e.target.value }))} /></div>
                  <div className="col-md-4">
                    <select className={inputClass} value={formState.status} onChange={(e) => setFormState((prev) => ({ ...prev, status: e.target.value }))}>
                      <option value="available">Available</option>
                      <option value="reserved">Reserved</option>
                      <option value="out_of_stock">Out of stock</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                  <div className="col-md-4"><input className={inputClass} type="number" step="0.01" placeholder="Unit price" value={formState.unit_price} onChange={(e) => setFormState((prev) => ({ ...prev, unit_price: e.target.value }))} /></div>
                  <div className="col-12"><textarea className={inputClass} rows="3" placeholder="Notes" value={formState.notes} onChange={(e) => setFormState((prev) => ({ ...prev, notes: e.target.value }))} /></div>
                </div>
              )}
              <div className="d-flex justify-content-end gap-2 mt-4">
                <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
                <button type="submit" className="btn btn-primary">{submitLabel}</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="asset-management-page container-fluid py-4">
      <div className="asset-hero mb-4">
        <div className="asset-hero-copy">
          <div className="asset-hero-kicker">Operations control</div>
          <h3 className="fw-bold mb-2">Asset Management</h3>
          <p className="asset-hero-text mb-3">
            Track office IT assets, desk placement, warranty, issues, repairs, replacement history, and spare stock from one register.
          </p>
          <div className="asset-hero-chips">
            <span className="asset-chip">4 offices</span>
            <span className="asset-chip">{summary?.assets ?? 0} assets</span>
            <span className="asset-chip">{summary?.warranty_soon ?? 0} expiring soon</span>
            <span className="asset-chip">{summary?.low_stock_items ?? 0} low stock</span>
          </div>
        </div>
        <div className="asset-hero-actions">
          <div className="asset-search">
            <i className="fa-solid fa-magnifying-glass" />
            <input
              className="form-control border-0 shadow-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assets by tag, name, brand, model"
            />
          </div>
          <button className="btn btn-primary asset-search-btn" onClick={() => load(search)}>
            Search assets
          </button>
        </div>
      </div>

      {loadError && (
        <div className={`alert ${loadError.includes('permission') ? 'alert-warning' : 'alert-danger'} mb-4`} role="alert">
          {loadError}
        </div>
      )}

      <div className="row g-3 mb-4 asset-summary-grid">
        <div className="col-md-3"><Card label="Offices" value={summary?.offices ?? 0} hint="Head office and branches" tone="blue" /></div>
        <div className="col-md-3"><Card label="Assets" value={summary?.assets ?? 0} hint="Registered items" tone="gold" /></div>
        <div className="col-md-3"><Card label="Warranty Soon" value={summary?.warranty_soon ?? 0} hint="Expiring within 30 days" tone="rose" /></div>
        <div className="col-md-3"><Card label="Low Stock" value={summary?.low_stock_items ?? 0} hint={`${summary?.stock_quantity ?? 0} total spare units`} tone="teal" /></div>
      </div>

      <div className="card shadow-sm mb-4 asset-tab-rail">
        <div className="card-body d-flex gap-2 flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`btn asset-tab-btn ${activeTab === tab.key ? 'asset-tab-btn-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'desks' && renderDeskTab()}
      {activeTab === 'assets' && renderAssetsTab()}
      {activeTab === 'dashboard' && renderDashboardTab()}
      {activeTab === 'warranties' && renderWarrantyTab()}
      {activeTab === 'issues' && renderIssuesTab()}
      {activeTab === 'repairs' && renderRepairsTab()}
      {activeTab === 'replacements' && renderReplacementTab()}
      {activeTab === 'movements' && renderMovementsTab()}
      {activeTab === 'stock' && renderStockTab()}
      {deskMoveModalOpen && selectedDesk && renderDeskMoveModal()}
      {(creatingAsset || editingAsset || editingStockItem) && renderEditModal()}
    </div>
  );
};

export default AssetManagement;
