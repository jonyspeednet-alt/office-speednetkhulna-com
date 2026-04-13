import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEntitlementsData, addEntitlement, updateEntitlement, deleteEntitlement } from '../services/entitlementService';
import Swal from 'sweetalert2';
import { buildAvatarDataUri } from '../utils/imagePaths';

const ManageEntitlements = () => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    user_id: '',
    leave_type_id: '',
    year: new Date().getFullYear(),
    total_days: ''
  });

  // Fetch all data (users, leave types, entitlements)
  const { data, isLoading: loading } = useQuery({
    queryKey: ['entitlementsData'],
    queryFn: getEntitlementsData,
  });

  const users = data?.users || [];
  const leaveTypes = data?.leaveTypes || [];
  const entitlements = data?.entitlements || {};

  // Add Mutation
  const addMutation = useMutation({
    mutationFn: addEntitlement,
    onSuccess: () => {
      Swal.fire('Success', 'Entitlement added successfully!', 'success');
      setFormData({ ...formData, total_days: '' });
      queryClient.invalidateQueries(['entitlementsData']);
    },
    onError: () => Swal.fire('ত্রুটি', 'বরাদ্দ যোগ করা যায়নি।', 'error')
  });

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, days }) => updateEntitlement(id, days),
    onSuccess: () => {
      Swal.fire('Updated!', 'Entitlement has been updated.', 'success');
      queryClient.invalidateQueries(['entitlementsData']);
    },
    onError: () => Swal.fire('ত্রুটি', 'হালনাগাদ করা যায়নি।', 'error')
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: deleteEntitlement,
    onSuccess: () => {
      Swal.fire('Deleted!', 'Entitlement has been deleted.', 'success');
      queryClient.invalidateQueries(['entitlementsData']);
    },
    onError: () => Swal.fire('ত্রুটি', 'মুছে ফেলা যায়নি।', 'error')
  });

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAddSubmit = (e) => {
    e.preventDefault();
    addMutation.mutate(formData);
  };

  const handleUpdate = async (id, currentDays) => {
    const { value: days } = await Swal.fire({
      title: 'Update Total Days',
      input: 'number',
      inputLabel: 'Total Days',
      inputValue: currentDays,
      showCancelButton: true,
      inputValidator: (value) => {
        if (!value) return 'You need to write something!';
      }
    });

    if (days) {
      updateMutation.mutate({ id, days });
    }
  };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Yes, delete it!'
    });

    if (result.isConfirmed) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="container-fluid p-4">
      <div className="mb-4">
        <h3 className="fw-bold text-dark mb-1">ছুটির কোটা ব্যবস্থাপনা</h3>
        <p className="text-muted small">কর্মচারীদের বার্ষিক ছুটির কোটা নির্ধারণ ও হালনাগাদ করুন</p>
      </div>

      {/* Add Form */}
      <div className="card border-0 shadow-sm rounded-4 mb-4 p-4 bg-white">
        <h5 className="fw-bold mb-3">নতুন কোটা যোগ করুন</h5>
        <form onSubmit={handleAddSubmit}>
          <div className="row g-3">
            <div className="col-md-4">
              <select name="user_id" className="form-select rounded-3" value={formData.user_id} onChange={handleInputChange} required>
                <option value="">কর্মচারী নির্বাচন করুন</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.employee_id})</option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <select name="leave_type_id" className="form-select rounded-3" value={formData.leave_type_id} onChange={handleInputChange} required>
                <option value="">ছুটির ধরণ</option>
                {leaveTypes.map(lt => (
                  <option key={lt.id} value={lt.id}>{lt.name}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <input type="number" name="year" className="form-control rounded-3" placeholder="বছর" value={formData.year} onChange={handleInputChange} required />
            </div>
            <div className="col-md-2">
              <input type="number" step="0.5" name="total_days" className="form-control rounded-3" placeholder="মোট দিন" value={formData.total_days} onChange={handleInputChange} required />
            </div>
            <div className="col-md-1">
              <button type="submit" className="btn btn-primary w-100 rounded-3"><i className="fas fa-plus"></i></button>
            </div>
          </div>
        </form>
      </div>

      {/* List */}
      <h5 className="fw-bold mb-3">বিদ্যমান ছুটির কোটা</h5>
      {loading ? (
        <div className="text-center">লোড হচ্ছে...</div>
      ) : (
        <div className="accordion" id="entitlementsAccordion">
          {users.length === 0 ? (
            <div className="alert alert-info">কোনো কর্মচারী পাওয়া যায়নি।</div>
          ) : (
            users.map(user => {
              const userEntitlements = entitlements[user.id];
              
              return (
                <div className="accordion-item border-0 shadow-sm mb-2 rounded-4 overflow-hidden" key={user.id}>
                  <h2 className="accordion-header">
                    <button className="accordion-button collapsed bg-white" type="button" data-bs-toggle="collapse" data-bs-target={`#collapse${user.id}`}>
                      <div className="d-flex align-items-center">
                        <img 
                          src={buildAvatarDataUri(user.full_name)} 
                          className="rounded-2 me-2" 
                          alt="Avatar" 
                          style={{width: '30px', height: '30px'}}
                        />
                        <span className="fw-bold text-dark">{user.full_name}</span> 
                        <span className="text-muted ms-2 small">({user.employee_id})</span>
                      </div>
                    </button>
                  </h2>
                  <div id={`collapse${user.id}`} className="accordion-collapse collapse" data-bs-parent="#entitlementsAccordion">
                    <div className="accordion-body bg-light">
                      {!userEntitlements ? (
                        <div className="alert alert-info mb-0">এই কর্মচারীর জন্য কোনো ছুটির কোটা সেট করা হয়নি।</div>
                      ) : (
                        Object.keys(userEntitlements).sort((a,b) => b - a).map(year => (
                          <div key={year} className="mb-3">
                            <h6 className="fw-bold text-primary border-bottom pb-1">বছর: {year}</h6>
                            <div className="table-responsive">
                              <table className="table table-sm table-hover mb-0">
                                <thead>
                                  <tr>
                                    <th>ছুটির ধরণ</th>
                                    <th>মোট দিন</th>
                                    <th style={{width: '120px'}}>অ্যাকশন</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {userEntitlements[year].map(ent => (
                                    <tr key={ent.id}>
                                      <td className="align-middle">{ent.leave_type_name}</td>
                                      <td className="align-middle fw-bold">{ent.total_days}</td>
                                      <td>
                                        <button 
                                          className="btn btn-sm btn-success me-1" 
                                          onClick={() => handleUpdate(ent.id, ent.total_days)}
                                          title="Edit"
                                        >
                                          <i className="fas fa-edit"></i>
                                        </button>
                                        <button 
                                          className="btn btn-sm btn-danger" 
                                          onClick={() => handleDelete(ent.id)}
                                          title="Delete"
                                        >
                                          <i className="fas fa-trash"></i>
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default ManageEntitlements;
