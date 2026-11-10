/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { collection, addDoc, query, onSnapshot, orderBy, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [records, setRecords] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [form, setForm] = useState({
    pacienteNombre: '',
    historiaClinica: '',
    actividad: '',
    horaInicio: '',
    horaFinal: '',
  });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const q = query(collection(db, 'records'), orderBy('horaInicio', 'desc'));
      return onSnapshot(q, (snapshot) => {
        setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'records'));
    }
  }, [user]);

  const handleLogin = async () => {
    await signInWithPopup(auth, new GoogleAuthProvider());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'records'), {
        ...form,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setForm({
        pacienteNombre: '',
        historiaClinica: '',
        actividad: '',
        horaInicio: '',
        horaFinal: '',
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'records');
    }
  };

  const handleOCR = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch('/api/ocr', {
        method: 'POST',
        body: formData
      });
      
      const responseText = await response.text();
      
      if (!response.ok) {
        throw new Error(`Server error (${response.status}): ${responseText}`);
      }
      
      try {
        const data = JSON.parse(responseText);
        if (data.pacienteNombre && data.historiaClinica) {
          setForm(prev => ({ ...prev, pacienteNombre: data.pacienteNombre, historiaClinica: data.historiaClinica }));
        } else {
          alert('No se pudieron detectar los datos automáticamente.');
        }
      } catch (e) {
        throw new Error(`Invalid JSON response: ${responseText}`);
      }
    } catch (err) {
      console.error('OCR Error:', err);
      alert('Error en el proceso OCR.');
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text('Bitácora de Actividades de Camilleros', 14, 15);
    autoTable(doc, {
      startY: 20,
      head: [['Paciente', 'H. Clínica', 'Actividad', 'Inicio', 'Final', 'Enf. Solicita', 'Enf. Verifica']],
      body: records.map(r => [r.pacienteNombre, r.historiaClinica, r.actividad, r.horaInicio, r.horaFinal, '', '']),
    });
    doc.save('bitacora.pdf');
  };

  if (!user) {
    return (
      <div className="flex justify-center items-center h-screen">
        <button onClick={handleLogin} className="bg-blue-500 text-white p-2 rounded">Iniciar sesión con Google</button>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Bitácora de Actividades de Camilleros</h1>
      
      <div className="mb-4">
        <label className="block mb-2 font-bold">Lector OCR (Documento/Manilla):</label>
        <input type="file" onChange={handleOCR} accept="image/*" capture="environment" className="border p-2" />
      </div>

      <form onSubmit={handleSubmit} className="mb-8 p-4 bg-gray-50 rounded border">
        <div className="grid grid-cols-2 gap-4">
          <input type="text" placeholder="Paciente" value={form.pacienteNombre} onChange={e => setForm({...form, pacienteNombre: e.target.value})} className="border p-2" required />
          <input type="text" placeholder="Historia Clínica" value={form.historiaClinica} onChange={e => setForm({...form, historiaClinica: e.target.value})} className="border p-2" required />
          <input type="text" placeholder="Actividad" value={form.actividad} onChange={e => setForm({...form, actividad: e.target.value})} className="border p-2" required />
          <input type="datetime-local" placeholder="Hora Inicio" value={form.horaInicio} onChange={e => setForm({...form, horaInicio: e.target.value})} className="border p-2" required />
          <input type="datetime-local" placeholder="Hora Final" value={form.horaFinal} onChange={e => setForm({...form, horaFinal: e.target.value})} className="border p-2" />
        </div>
        <button type="submit" className="mt-4 bg-green-500 text-white p-2 rounded">Guardar Registro</button>
      </form>

      <button onClick={exportToPDF} className="mb-4 bg-blue-500 text-white p-2 rounded">Exportar a PDF</button>

      <table className="w-full border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">Paciente</th>
            <th className="border p-2">H. Clínica</th>
            <th className="border p-2">Actividad</th>
            <th className="border p-2">Inicio</th>
            <th className="border p-2">Final</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td className="border p-2">{record.pacienteNombre}</td>
              <td className="border p-2">{record.historiaClinica}</td>
              <td className="border p-2">{record.actividad}</td>
              <td className="border p-2">{new Date(record.horaInicio).toLocaleString()}</td>
              <td className="border p-2">{record.horaFinal ? new Date(record.horaFinal).toLocaleString() : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

