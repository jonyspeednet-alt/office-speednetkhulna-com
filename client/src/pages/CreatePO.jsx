import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const CreatePO = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [formData, setFormData] = useState({
    vendor_id: '',
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: '',
    notes: '',
    items: [{ item_name: '', description: '', quantity: 1, unit_price: 0 }]
  });

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    try {
      const res = await axios.get('/api/assets/masters');
      setVendors(res.data.vendors || []);
    } catch (err) {
      toast.error('Failed to load vendors');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleItemChange = (index, e) => {
    const { name, value } = e.target;
    const newItems = [...formData.items];
    newItems[index][name] = value;
    setFormData({ ...formData, items: newItems });
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { item_name: '', description: '', quantity: 1, unit_price: 0 }]
    });
  };

  const removeItem = (index) => {
    if (formData.items.length === 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const calculateTotal = () => {
    return formData.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post('/api/procurement', formData);
      toast.success('Purchase order created successfully');
      navigate('/view-pos');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create purchase order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-lg dark:bg-slate-800 transition-all">
      <h1 className="text-2xl font-bold mb-6 text-slate-800 dark:text-white flex items-center gap-2">
        <i className="fa-solid fa-file-invoice text-indigo-500"></i>
        Create Purchase Order
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Vendor</label>
            <select
              name="vendor_id"
              value={formData.vendor_id}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              required
            >
              <option value="">Select Vendor</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Order Date</label>
            <input
              type="date"
              name="order_date"
              value={formData.order_date}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              required
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Items</h2>
            <button
              type="button"
              onClick={addItem}
              className="px-3 py-1 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors flex items-center gap-1 text-sm"
            >
              <i className="fa-solid fa-plus"></i> Add Item
            </button>
          </div>

          {formData.items.map((item, index) => (
            <div key={index} className="p-4 border rounded-xl bg-slate-50 dark:bg-slate-900/50 dark:border-slate-700 relative animate-in fade-in slide-in-from-top-2 duration-300">
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="absolute top-2 right-2 text-rose-500 hover:text-rose-600 transition-colors"
              >
                <i className="fa-solid fa-trash"></i>
              </button>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <input
                    type="text"
                    name="item_name"
                    value={item.item_name}
                    onChange={(e) => handleItemChange(index, e)}
                    placeholder="Item Name"
                    className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                    required
                  />
                </div>
                <div>
                  <input
                    type="number"
                    name="quantity"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(index, e)}
                    placeholder="Quantity"
                    min="1"
                    className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                    required
                  />
                </div>
                <div>
                  <input
                    type="number"
                    name="unit_price"
                    value={item.unit_price}
                    onChange={(e) => handleItemChange(index, e)}
                    placeholder="Unit Price"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                    required
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-xl font-bold text-slate-800 dark:text-white">
            Total Amount: <span className="text-indigo-600 dark:text-indigo-400">৳{calculateTotal().toLocaleString()}</span>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full md:w-auto px-8 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
          >
            {loading ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : null}
            Submit Purchase Order
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreatePO;
