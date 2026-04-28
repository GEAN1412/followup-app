import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, 
  User, 
  MessageSquare, 
  Upload, 
  Search, 
  Download, 
  Image as ImageIcon, 
  Plus, 
  ListFilter,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  addDoc, 
  updateDoc,
  deleteDoc,
  doc,
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  limit 
} from 'firebase/firestore';
import { db, auth } from './lib/firebase';
import { handleFirestoreError } from './lib/error-handler';
import { FollowUpData, OperationType } from './types';
import imageCompression from 'browser-image-compression';
import axios from 'axios';
import Papa from 'papaparse';

// Design Constants
const CATEGORIES = ['CS Follow-up', 'Admin Tracking'];

export default function App() {
  const [activeTab, setActiveTab] = useState(CATEGORIES[0]);
  const [followups, setFollowups] = useState<FollowUpData[]>([]);
  const [loading, setLoading] = useState(true);

  // CS Form State
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formPic, setFormPic] = useState(''); // Empty by default for dynamic input
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [formCaption, setFormCaption] = useState('');
  const [formFile, setFormFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [existingScreenshotUrl, setExistingScreenshotUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Admin Tracking State
  const [searchPic, setSearchPic] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  // Fetch data
  useEffect(() => {
    const q = query(collection(db, 'followups'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FollowUpData[];
      setFollowups(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'followups');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'dinalaundry21') {
      setIsAdminAuthenticated(true);
      setErrorMsg('');
    } else {
      setErrorMsg('Password admin salah!');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setErrorMsg('');
      try {
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1024,
          useWebWorker: true,
        };
        const compressedFile = await imageCompression(file, options);
        setFormFile(compressedFile);
      } catch (error) {
        console.error('Compression error:', error);
        setErrorMsg('Gagal mengompres gambar.');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If not editing, we MUST have a file. If editing, we can keep the old one.
    if (!formPic || !formCaption || !customerName || !customerPhone || (!formFile && !editingId)) {
      setErrorMsg('Semua field harus diisi.');
      return;
    }

    setUploading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      let finalScreenshotUrl = existingScreenshotUrl;

      // 1. Upload to server if there's a new file
      if (formFile) {
        const formData = new FormData();
        formData.append('screenshot', formFile);
        formData.append('date', formDate);
        formData.append('pic', formPic);

        const uploadRes = await axios.post('/api/upload', formData);
        finalScreenshotUrl = uploadRes.data.url;

        if (!finalScreenshotUrl) {
          throw new Error('Gagal mendapatkan URL screenshot dari server.');
        }

        // If we were editing and uploaded a new file, we should delete the OLD one
        if (editingId && existingScreenshotUrl) {
           try {
             await axios.post('/api/delete-image', { screenshotUrl: existingScreenshotUrl });
           } catch (err) {
             console.warn('Failed to delete old image from Cloudinary:', err);
           }
        }
      }

      if (!finalScreenshotUrl) {
        throw new Error('Screenshot tidak ditemukan.');
      }

      // 2. Save to Firestore
      const monthYear = formDate.substring(5, 7) + '-' + formDate.substring(0, 4); // MM-YYYY
      
      const payload: any = {
        date: formDate,
        customerName: customerName,
        customerPhone: customerPhone,
        pic: formPic,
        caption: formCaption,
        screenshotUrl: finalScreenshotUrl,
        monthYear: monthYear,
        timestamp: serverTimestamp()
      };

      try {
        if (editingId) {
          await updateDoc(doc(db, 'followups', editingId), payload);
          setSuccessMsg('Data berhasil diperbarui!');
        } else {
          await addDoc(collection(db, 'followups'), payload);
          setSuccessMsg('Follow-up berhasil disimpan!');
        }
      } catch (fErr) {
        handleFirestoreError(fErr, editingId ? OperationType.UPDATE : OperationType.CREATE, 'followups');
      }

      // Reset form
      handleCancelEdit();
    } catch (error: any) {
      console.error('Submit error:', error);
      setErrorMsg(error.message || 'Gagal menyimpan data.');
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (f: FollowUpData) => {
    setEditingId(f.id || null);
    setFormDate(f.date);
    setCustomerName(f.customerName);
    setCustomerPhone(f.customerPhone);
    setFormPic(f.pic);
    setFormCaption(f.caption);
    setExistingScreenshotUrl(f.screenshotUrl);
    setFormFile(null); // Clear new file selection
    setErrorMsg('');
    setSuccessMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setExistingScreenshotUrl(null);
    setFormCaption('');
    setCustomerName('');
    setCustomerPhone('');
    setFormPic('');
    setFormFile(null);
    // Reset file input
    const fileInput = document.getElementById('screenshot-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = async (f: FollowUpData) => {
    if (!f.id) return;
    setConfirmDeleteId(f.id);
  };

  const executeDelete = async (f: FollowUpData) => {
    setDeletingIds(prev => new Set(prev).add(f.id!));
    setConfirmDeleteId(null);
    setErrorMsg('');
    setSuccessMsg('');
    
    try {
      // 1. Delete from Firestore first (primary data)
      await deleteDoc(doc(db, 'followups', f.id!));
      
      // 2. Attempt to delete from Cloudinary in background
      axios.post('/api/delete-image', { screenshotUrl: f.screenshotUrl }).catch(err => {
        console.warn('Background Cloudinary delete failed:', err);
      });
      
      setSuccessMsg('Data berhasil dihapus.');
      if (editingId === f.id) handleCancelEdit();
    } catch (error: any) {
      console.error('Delete error:', error);
      setErrorMsg(error.message || 'Gagal menghapus data.');
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(f.id!);
        return next;
      });
    }
  };

  const filteredFollowups = useMemo(() => {
    return followups.filter(f => {
      const matchPic = f.pic.toLowerCase().includes(searchPic.toLowerCase());
      const matchMonth = filterMonth ? f.monthYear === filterMonth : true;
      const matchDate = filterDate ? f.date === filterDate : true;
      const matchCustomer = f.customerName?.toLowerCase().includes(searchPic.toLowerCase()) || 
                             f.customerPhone?.includes(searchPic);
      return (matchPic || matchCustomer) && matchMonth && matchDate;
    });
  }, [followups, searchPic, filterMonth, filterDate]);

  const downloadCSV = () => {
    const dataToExport = filteredFollowups.map(f => ({
      Tanggal: f.date,
      Nama_Konsumen: f.customerName,
      No_HP: f.customerPhone,
      PIC: f.pic,
      Caption: f.caption,
      Bulan_Tahun: f.monthYear,
      URL_Screenshot: f.screenshotUrl
    }));

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `tracking_followup_${new Date().toISOString()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-natural-bg overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-natural-border bg-white p-6 flex flex-col justify-between overflow-y-auto">
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-natural-primary rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-serif text-lg font-bold text-natural-text-dark leading-none">LaundryMonitoringTrack</h1>
              <p className="text-[10px] text-natural-text-muted uppercase tracking-wider mt-1">CS Follow-up Tracker</p>
            </div>
          </div>
          
          <nav className="space-y-1">
            {CATEGORIES.map((cat, idx) => (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                className={`w-full sidebar-link-natural text-left gap-3 ${
                  activeTab === cat 
                  ? 'bg-natural-border text-natural-text-dark' 
                  : 'text-natural-sidebar-link hover:bg-gray-50'
                }`}
              >
                {idx === 0 ? <MessageSquare className="w-5 h-5" /> : <ListFilter className="w-5 h-5" />}
                {cat}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-8 p-4 bg-gray-50 rounded-2xl border border-natural-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-natural-border flex items-center justify-center text-natural-text-dark font-bold text-xs">SA</div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-natural-text-dark truncate">Gean Pratama</p>
              <p className="text-[10px] text-natural-text-muted">Created By</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        {/* Global Messages */}
        <div className="max-w-7xl mx-auto mb-6">
          <AnimatePresence>
            {successMsg && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0 }}
                className="mb-4 p-4 bg-green-50 border border-green-100 text-green-700 text-sm rounded-xl font-medium flex items-center gap-3"
              >
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span>{successMsg}</span>
                <button onClick={() => setSuccessMsg('')} className="ml-auto opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
              </motion.div>
            )}
            {errorMsg && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0 }}
                className="mb-4 p-4 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl font-medium flex items-center gap-3"
              >
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="truncate max-w-md">{errorMsg}</span>
                <button onClick={() => setErrorMsg('')} className="ml-auto opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {confirmDeleteId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl shadow-red-200/50"
              >
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 mx-auto text-red-600">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-natural-text-dark text-center mb-2">Konfirmasi Hapus</h3>
                <p className="text-sm text-natural-text-muted text-center mb-6">
                  Apakah Anda yakin ingin menghapus data ini? Data dan screenshotnya akan terhapus permanen dari sistem.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setConfirmDeleteId(null)}
                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={() => {
                      const f = followups.find(x => x.id === confirmDeleteId);
                      if (f) executeDelete(f);
                    }}
                    className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-200 transition-all"
                  >
                    Hapus
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {activeTab === CATEGORIES[0] ? (
            <motion.div
              key="cs-form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 xl:grid-cols-12 gap-8 content-start"
            >
              <header className="xl:col-span-12 mb-2">
                <div className="space-y-1">
                  <h2 className="font-serif text-3xl text-natural-text-dark">Input Follow-up</h2>
                  <p className="text-natural-text-muted">Masukan detail follow-up konsumen untuk hari ini.</p>
                </div>
              </header>

              <section className="xl:col-span-5 self-start">
                <div className="card-natural p-6">
                  <div className="flex items-center justify-between border-b border-gray-50 pb-3 mb-6">
                    <h3 className="text-sm font-bold text-natural-text-dark uppercase tracking-wider">
                      {editingId ? 'Edit Data Follow-up' : 'Data Input Follow-up'}
                    </h3>
                    {editingId && (
                      <button 
                        onClick={handleCancelEdit}
                        className="flex items-center gap-1 text-[10px] font-bold text-red-500 hover:underline"
                      >
                        <X className="w-3 h-3" /> BATAL EDIT
                      </button>
                    )}
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-natural-text-muted">Tanggal</label>
                        <input 
                          type="date" 
                          value={formDate || ''}
                          onChange={(e) => setFormDate(e.target.value)}
                          className="w-full px-3 py-2 border border-natural-border rounded-lg text-sm focus:ring-1 focus:ring-natural-primary outline-none"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-natural-text-muted">PIC Follow-up</label>
                        <input 
                          type="text" 
                          placeholder="Nama PIC..."
                          value={formPic || ''}
                          onChange={(e) => setFormPic(e.target.value)}
                          className="w-full px-3 py-2 border border-natural-border rounded-lg text-sm focus:ring-1 focus:ring-natural-primary outline-none"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-natural-text-muted">Nama Konsumen</label>
                        <input 
                          type="text" 
                          placeholder="Nama Konsumen..."
                          value={customerName || ''}
                          onChange={(e) => setCustomerName(e.target.value)}
                          className="w-full px-3 py-2 border border-natural-border rounded-lg text-sm focus:ring-1 focus:ring-natural-primary outline-none"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-natural-text-muted">No. HP Konsumen</label>
                        <input 
                          type="text" 
                          placeholder="08123..."
                          value={customerPhone || ''}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          className="w-full px-3 py-2 border border-natural-border rounded-lg text-sm focus:ring-1 focus:ring-natural-primary outline-none"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-natural-text-muted">Caption / Hasil Follow-up</label>
                      <textarea 
                        rows={4}
                        placeholder="Tuliskan detail percakapan..."
                        value={formCaption || ''}
                        onChange={(e) => setFormCaption(e.target.value)}
                        className="w-full px-3 py-2 border border-natural-border rounded-lg text-sm focus:ring-1 focus:ring-natural-primary outline-none placeholder:text-gray-300"
                        required
                      ></textarea>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-natural-text-muted">Screenshoot Bukti</label>
                      <input 
                        type="file" 
                        id="screenshot-upload"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <label 
                        htmlFor="screenshot-upload"
                        className={`block border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer ${
                          formFile 
                          ? 'border-natural-primary bg-natural-bg/50' 
                          : 'border-natural-border bg-gray-50 hover:border-natural-primary'
                        }`}
                      >
                        {formFile ? (
                          <div className="flex flex-col items-center gap-1">
                            <CheckCircle2 className="w-8 h-8 text-natural-primary" />
                            <p className="text-[11px] font-bold text-natural-text-dark">{formFile.name}</p>
                            <p className="text-[9px] text-natural-text-muted italic">Sudah dikompres otomatis</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-natural-text-muted">
                            <ImageIcon className="w-8 h-8 opacity-50" />
                            <p className="text-[11px] font-bold">Upload Bukti (Max 5MB)</p>
                            <p className="text-[9px] italic">Simpan ke Cloudinary</p>
                          </div>
                        )}
                      </label>
                    </div>

                    <button 
                      type="submit"
                      disabled={uploading}
                      className={`w-full py-3 rounded-xl font-semibold text-sm shadow-md mt-2 flex items-center justify-center gap-2 transition-all ${
                        editingId ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'btn-natural-primary'
                      }`}
                    >
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />)}
                      {uploading ? 'Menyimpan...' : (editingId ? 'Perbarui Data Follow-up' : 'Submit & Simpan Cloudinary')}
                    </button>
                  </form>
                </div>
              </section>

              <section className="xl:col-span-7 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="card-natural p-4 border-l-4 border-l-natural-primary">
                    <p className="text-[10px] uppercase font-bold text-natural-text-muted mb-1">Total Follow-up</p>
                    <p className="text-2xl font-bold text-natural-text-dark">{followups.length}</p>
                    <p className="text-[10px] text-green-600 font-medium mt-1">Live data</p>
                  </div>
                  <div className="card-natural p-4 border-l-4 border-l-amber-400">
                    <p className="text-[10px] uppercase font-bold text-natural-text-muted mb-1">Hari Ini</p>
                    <p className="text-2xl font-bold text-natural-text-dark">
                      {followups.filter(f => f.date === new Date().toISOString().split('T')[0]).length}
                    </p>
                    <p className="text-[10px] text-amber-600 font-medium mt-1">Update otomatis</p>
                  </div>
                  <div className="card-natural p-4 border-l-4 border-l-blue-400">
                    <p className="text-[10px] uppercase font-bold text-natural-text-muted mb-1">Bulan Ini</p>
                    <p className="text-2xl font-bold text-natural-text-dark">
                      {followups.filter(f => f.monthYear === (new Date().getMonth() + 1).toString().padStart(2, '0') + '-' + new Date().getFullYear()).length}
                    </p>
                    <p className="text-[10px] text-blue-600 font-medium mt-1">Sistem Pelacakan</p>
                  </div>
                </div>

                <div className="card-natural flex flex-col h-full min-h-[400px]">
                  <div className="p-4 border-b border-gray-50 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-natural-text-dark uppercase tracking-wider">Aktivitas Terakhir</h3>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="grid divide-y divide-gray-50">
                      {loading ? (
                        <div className="py-20 text-center"><LoadingSpinner /></div>
                      ) : followups.length === 0 ? (
                        <div className="py-20 text-center text-natural-text-muted text-xs">Belum ada aktivitas.</div>
                      ) : (
                        followups.slice(0, 5).map(f => (
                          <div key={f.id} className="group p-4 flex gap-4 hover:bg-gray-50/50 transition-colors relative">
                            <img src={f.screenshotUrl} className="w-16 h-16 rounded-lg object-cover bg-gray-100 flex-shrink-0" referrerPolicy="no-referrer" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-bold text-natural-text-dark">{f.date}</span>
                                <span className="text-[10px] text-natural-text-muted whitespace-nowrap italic">— {f.pic}</span>
                              </div>
                              <p className="text-[10px] font-bold text-natural-text-dark mb-0.5">{f.customerName}</p>
                              <p className="text-[10px] text-natural-text-dark line-clamp-1 leading-relaxed opacity-70">{f.caption}</p>
                            </div>
                            
                            <div className="flex flex-col gap-2">
                              <button 
                                onClick={() => handleEdit(f)}
                                className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDelete(f)}
                                disabled={f.id ? deletingIds.has(f.id) : false}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  f.id && deletingIds.has(f.id) 
                                  ? 'bg-gray-100 text-gray-400' 
                                  : 'bg-red-50 text-red-600 hover:bg-red-100'
                                }`}
                                title="Hapus"
                              >
                                {f.id && deletingIds.has(f.id) ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </motion.div>
          ) : (
            <motion.div
              key="admin-tracking"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {!isAdminAuthenticated ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <form onSubmit={handleAdminAuth} className="card-natural p-8 max-w-sm w-full space-y-6">
                    <div className="text-center space-y-2">
                       <AlertCircle className="w-12 h-12 text-natural-primary mx-auto opacity-20" />
                       <h2 className="font-serif text-2xl text-natural-text-dark">Akses Terbatas</h2>
                       <p className="text-xs text-natural-text-muted">Masukkan password admin dinalaundry21 untuk melihat tracking.</p>
                    </div>
                    <div className="space-y-2">
                      <input 
                        type="password" 
                        placeholder="Password..."
                        value={adminPassword || ''}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-natural-border rounded-xl focus:outline-none focus:ring-1 focus:ring-natural-primary text-center tracking-widest"
                      />
                      {errorMsg && <p className="text-[10px] text-red-500 font-bold text-center">{errorMsg}</p>}
                    </div>
                    <button className="w-full py-3 btn-natural-primary rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98]">
                      Buka Akses Admin
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-1">
                      <h2 className="font-serif text-3xl text-natural-text-dark tracking-tight">Admin Analytics</h2>
                      <p className="text-natural-text-muted">Tracking data follow-up setiap hari, bulan, atau PIC.</p>
                    </div>
                    <button 
                      onClick={downloadCSV}
                      className="flex items-center gap-2 bg-natural-text-dark text-white px-5 py-3 rounded-xl hover:opacity-90 transition-all font-bold text-sm shadow-xl"
                    >
                      <Download className="w-4 h-4" /> Download Laporan (.CSV)
                    </button>
                  </header>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 card-natural p-4">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-text-muted"><Search className="w-4 h-4" /></span>
                      <input type="text" placeholder="Cari PIC/Konsumen..." value={searchPic || ''} onChange={(e) => setSearchPic(e.target.value)} className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-natural-primary" />
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-text-muted"><Calendar className="w-4 h-4" /></span>
                      <input type="date" value={filterDate || ''} onChange={(e) => setFilterDate(e.target.value)} className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-natural-primary" />
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-text-muted"><ListFilter className="w-4 h-4" /></span>
                      <input type="text" placeholder="MM-YYYY" value={filterMonth || ''} onChange={(e) => setFilterMonth(e.target.value)} className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-natural-primary" />
                    </div>
                    <div className="flex items-center justify-end">
                      <span className="text-[10px] font-bold text-natural-text-muted tracking-widest uppercase">Showing {filteredFollowups.length} rows</span>
                    </div>
                  </div>

                  <div className="card-natural overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 text-[10px] uppercase font-bold text-natural-text-muted border-b border-natural-border">
                          <tr>
                            <th className="px-6 py-4">Tanggal</th>
                            <th className="px-6 py-4">Konsumen</th>
                            <th className="px-6 py-4">WhatsApp/HP</th>
                            <th className="px-6 py-4">PIC</th>
                            <th className="px-6 py-4">Keterangan</th>
                            <th className="px-6 py-4 text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="text-xs text-natural-text-dark divide-y divide-gray-50">
                          {filteredFollowups.map(f => (
                            <tr key={f.id} className="hover:bg-natural-bg/30 transition-colors">
                              <td className="px-6 py-4 font-semibold">{f.date}</td>
                              <td className="px-6 py-4 font-bold">{f.customerName}</td>
                              <td className="px-6 py-4">{f.customerPhone}</td>
                              <td className="px-6 py-4 italic">{f.pic}</td>
                              <td className="px-6 py-4 max-w-[200px] truncate">{f.caption}</td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-3">
                                  <a href={f.screenshotUrl} target="_blank" rel="noreferrer" className="text-natural-primary font-bold hover:underline">Detail</a>
                                  <button onClick={() => { setActiveTab(CATEGORIES[0]); handleEdit(f); }} className="text-amber-500 hover:text-amber-600 transition-colors">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    onClick={() => handleDelete(f)} 
                                    disabled={f.id ? deletingIds.has(f.id) : false}
                                    className={`${f.id && deletingIds.has(f.id) ? 'text-gray-400' : 'text-red-500 hover:text-red-600'} transition-colors`}
                                  >
                                    {f.id && deletingIds.has(f.id) ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center space-x-2">
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
    </div>
  );
}
