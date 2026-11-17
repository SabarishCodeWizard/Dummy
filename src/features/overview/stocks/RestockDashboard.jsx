import { useState } from 'react';
import { AlertTriangle, Plus, Settings2 } from 'lucide-react';
import { Card, Button, cn } from '@/ui';
import { db } from '@/core/db';
import { useNavigate } from 'react-router';

export default function RestockDashboard({ rows, onReload }) {
  const navigate = useNavigate();

  // Find products that are below min stock level (and min stock level > 0)
  const lowStockItems = rows.filter(r => r.minStockLevel > 0 && r.available <= r.minStockLevel);

  const handleCreatePO = (item) => {
    // Generate a Purchase Order for the missing quantity
    const missingQty = Math.max(1, (item.minStockLevel - item.available) || 1);
    navigate(`/purchase/bill?product=${encodeURIComponent(item.description)}&qty=${missingQty}`);
  };

  return (
    <div className="mb-6">
      <Card className="bg-orange-50/50 border-orange-200">
        <div className="p-4 border-b border-orange-200 flex justify-between items-center">
          <div className="flex items-center gap-2 text-orange-800">
            <AlertTriangle className="size-5" />
            <h3 className="font-bold text-lg">Restock Alerts</h3>
          </div>
        </div>
        <div className="p-4">
          {lowStockItems.length === 0 ? (
            <p className="text-orange-700/80 text-sm italic">
              All inventory levels are healthy! No items are currently below their minimum thresholds.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {lowStockItems.map(item => (
                <div key={item.description} className="bg-white rounded-lg p-3 border border-orange-100 shadow-sm flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-slate-800 truncate" title={item.description}>{item.description}</h4>
                    <p className="text-xs text-slate-500 mt-1">Available: <span className="font-bold text-red-600">{item.available}</span> / Min: {item.minStockLevel}</p>
                  </div>
                  <Button variant="primary" className="mt-3 w-full py-1.5 text-xs" onClick={() => handleCreatePO(item)}>
                    Generate PO
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

    </div>
  );
}
