import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';

const ViewPOs = () => {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPOs();
  }, []);

  const fetchPOs = async () => {
    try {
      const res = await axios.get('/api/procurement');
      setPos(res.data || []);
    } catch (err) {
      toast.error('Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'approved': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'received': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'cancelled': return 'bg-rose-100 text-rose-700 border-rose-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <i className="fa-solid fa-list-check text-indigo-500"></i>
            Purchase Orders
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage and track all purchase orders</p>
        </div>
        <Link
          to="/create-po"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-md"
        >
          <i className="fa-solid fa-plus"></i> Create PO
        </Link>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 dark:text-slate-300">PO Number</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Vendor</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Order Date</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Total Amount</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Status</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 dark:text-slate-300 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-slate-500">
                    <i className="fa-solid fa-spinner fa-spin text-2xl mb-2"></i>
                    <p>Loading orders...</p>
                  </td>
                </tr>
              ) : pos.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-slate-500">
                    <i className="fa-solid fa-inbox text-3xl mb-2 opacity-20"></i>
                    <p>No purchase orders found</p>
                  </td>
                </tr>
              ) : (
                pos.map(po => (
                  <tr key={po.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-6 py-4 font-medium text-indigo-600 dark:text-indigo-400">#{po.po_number}</td>
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300">{po.vendor_name || 'N/A'}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{new Date(po.order_date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 font-semibold text-slate-800 dark:text-white">৳{Number(po.total_amount).toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(po.status)}`}>
                        {po.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                        <i className="fa-solid fa-eye"></i>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ViewPOs;
