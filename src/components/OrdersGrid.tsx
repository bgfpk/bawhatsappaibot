import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz, colorSchemeDark } from 'ag-grid-community';
import { OrderActionButtons } from './OrderActionButtons';

// Register ag-Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

interface OrdersGridProps {
  orders: any[];
  setOrders: (orders: any[]) => void;
  onUpdateOrder: (orderId: string, data: any) => Promise<boolean>;
  onBookPostexOrder?: (order: any) => Promise<void>;
  onSyncTracking?: (order: any) => Promise<void>;
  onCancelOrder?: (order: any) => Promise<void>;
  onDeleteOrder?: (order: any) => Promise<void>;
  dynamicColumns: string[];
}

const FIELD_ALIASES: Record<string, string[]> = {
  name: ["customerName", "name"],
  phone: ["customerPhone", "phone"],
  address: ["deliveryAddress", "orderAddress", "address"],
  city: ["cityName", "city", "deliveryCity"],
  product: ["productName", "product_name", "itemName"],
  quantity: ["quantity", "qty"],
  "cod amount": ["totalPrice", "codAmount", "invoicePayment", "total"],
  "total price": ["totalPrice", "codAmount", "invoicePayment", "total"],
  pieces: ["items", "pieces", "invoiceDivision"],
  items: ["items", "quantity"],
  "order type": ["orderType"],
  "pickup address code": ["pickupAddressCode"],
  "store address code": ["storeAddressCode"],
  "tracking id": ["trackingNumber", "tracking_id", "awb"],
  "tracking number": ["trackingNumber", "tracking_id", "awb"],
  "courier status": ["latestTrackingStatus", "transactionStatus", "postexStatus"],
  "shipping charge": ["shippingCharge", "shipping_charge"],
  notes: ["orderDetail", "detail", "notes", "transactionNotes"],
};

const getFieldValue = (details: any, column: string) => {
  const key = column.toLowerCase();
  const aliases = FIELD_ALIASES[key] || [column, key];
  for (const alias of aliases) {
    if (details[alias] !== undefined && details[alias] !== null && details[alias] !== "") return details[alias];
  }
  const customFieldValue = details?.customFields?.[column] ?? details?.customFields?.[key];
  if (customFieldValue !== undefined && customFieldValue !== null && customFieldValue !== "") return customFieldValue;
  if (key.includes("name") && !key.includes("business")) return details.customerName || details.name;
  if (key.includes("phone") || key.includes("number")) return details.customerPhone || details.phone;
  if (key.includes("address")) return details.deliveryAddress || details.orderAddress || details.address;
  return details[column] || details[key] || "";
};

const setFieldValue = (details: any, column: string, value: any) => {
  const key = column.toLowerCase();
  const next = { ...details };
  const target = (FIELD_ALIASES[key] || [column])[0];
  if (FIELD_ALIASES[key]) {
    next[target] = value;
  } else {
    next.customFields = { ...(next.customFields || {}), [column]: value };
  }

  if (key === "name") next.name = value;
  if (key === "phone") next.phone = value;
  if (key === "address") {
    next.orderAddress = value;
    next.address = value;
  }
  if (key === "cod amount") {
    next.codAmount = value;
    next.invoicePayment = value;
  }
  if (key === "notes") next.transactionNotes = value;
  return next;
};

export function OrdersGrid({ orders, setOrders, onUpdateOrder, onBookPostexOrder, onSyncTracking, onCancelOrder, onDeleteOrder, dynamicColumns }: OrdersGridProps) {
  const gridRef = useRef<AgGridReact>(null);

  const [rowData, setRowData] = useState<any[]>([]);
  const [isDark, setIsDark] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  useEffect(() => {
    const checkDark = () => setIsDark(document.documentElement.classList.contains('dark'));
    checkDark();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          checkDark();
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Map orders to flat row data for editing
    const rowDataMapped = orders.map((o) => {
      const details = o.order_data || {};
      const recordType = String(details.recordType || "").toLowerCase() === "lead" ? "Lead" : "Order";
      const recordStatus = String(details.recordStatus || "").toLowerCase() === "incomplete" ? "Incomplete" : "Complete";
      const row: any = {
        _id: o.$id || o.id,
        $original: o,
        "Type": recordType,
        "Status": recordStatus,
        "Date": new Intl.DateTimeFormat('en-PK', { timeZone: 'Asia/Karachi', year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(
          (o.created_at || o.$createdAt) && !isNaN(Number(o.created_at || o.$createdAt)) 
            ? (Number(o.created_at || o.$createdAt) > 100000000000 ? Number(o.created_at || o.$createdAt) : Number(o.created_at || o.$createdAt) * 1000)
            : (o.created_at || o.$createdAt || Date.now())
        )),
        "Sr#": o.sr_no || "—",
      };

      dynamicColumns.forEach((col) => {
        const lc = col.toLowerCase();
        if (["date", "sr#"].includes(lc)) return;

        
        const val = getFieldValue(details, col);

        row[col] = val || "";
      });

      return row;
    });
    setRowData(rowDataMapped);
  }, [orders, dynamicColumns]);

  const columnDefs = useMemo(() => {
    const cols: any[] = [];
    ["Type", "Status", "Date", "Sr#", ...dynamicColumns.filter(c => !["Type", "Status", "Date", "Sr#"].includes(c))].forEach((col) => {
      cols.push({
        field: col,
        headerName: col,
        editable: !["Type", "Status", "Date", "Sr#"].includes(col),
        cellEditor: 'agLargeTextCellEditor',
        cellEditorPopup: true,
        cellEditorParams: {
          maxLength: 1000,
          rows: 6
        },
        tooltipValueGetter: (p: any) => p.value,
      });
    });

    if (onBookPostexOrder || onSyncTracking || onCancelOrder || onDeleteOrder) {
      cols.push({
        field: "Actions",
        headerName: "Actions",
        editable: false,
        pinned: "right",
        minWidth: 150,
        filter: false,
        sortable: false,
        cellRenderer: (params: any) => {
          const original = params.data?.$original;
          const details = original?.order_data || {};
          const isLead = String(details.recordType || "").toLowerCase() === "lead";
          const hasTracking = !!(details.trackingNumber || details.tracking_id || details.awb);
          const id = params.data?._id;
          const busy = busyOrderId === id;
          return (
            <OrderActionButtons
              order={original}
              busy={busy}
              hasTracking={hasTracking}
              onWorkStart={() => setBusyOrderId(id)}
              onWorkEnd={() => setBusyOrderId(null)}
              onBookPostexOrder={isLead ? undefined : onBookPostexOrder}
              onSyncTracking={isLead ? undefined : onSyncTracking}
              onCancelOrder={isLead ? undefined : onCancelOrder}
              onDeleteOrder={onDeleteOrder}
            />
          );
        },
      });
    }

    return cols;
  }, [dynamicColumns, busyOrderId, onBookPostexOrder, onSyncTracking, onCancelOrder, onDeleteOrder]);

  // DefaultColDef sets props common to all Columns
  const defaultColDef = useMemo(() => {
    return {
      flex: 1,
      minWidth: 100,
      filter: true,
      sortable: true,
      resizable: true,
    };
  }, []);

  const onCellValueChanged = useCallback(async (event: any) => {
    const { data, colDef, newValue, oldValue } = event;
    if (newValue === oldValue) return;
    
    // Process update to backend
    const field = colDef.field;
    const orderId = data._id;
    const originalOrder = event.data.$original;
    
    if (originalOrder && orderId) {
       if (field === "Actions") return;
       const newOrderData = setFieldValue(originalOrder.order_data || {}, field, newValue);
       
       await onUpdateOrder(orderId, newOrderData);
    }
  }, [onUpdateOrder]);

  const onGridReady = useCallback((params: any) => {
    // Intentionally skipped localStorage apply
  }, []);

  const onColumnMoved = useCallback(() => {
    // Intentionally skipped localStorage set
  }, []);
  
  const onColumnResized = useCallback(() => {
    // Intentionally skipped localStorage set
  }, []);
  
  const onSortChanged = useCallback(() => {
    // Intentionally skipped localStorage set
  }, []);

  const theme = useMemo(() => {
    let t = themeQuartz.withParams({
        fontFamily: 'inherit',
        headerBackgroundColor: isDark ? '#101511' : '#f7faf8',
        backgroundColor: 'transparent',
        foregroundColor: isDark ? '#f5f7f6' : '#101820',
        borderColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(15,23,42,0.1)',
        rowHoverColor: isDark ? 'rgba(40,199,111,0.08)' : 'rgba(20,143,77,0.055)',
        headerTextColor: isDark ? '#a5b2ad' : '#5f6f69',
        spacing: 8,
        wrapperBorderRadius: 16,
    });
    if (isDark) {
        t = t.withPart(colorSchemeDark);
    }
    return t;
  }, [isDark]);

  return (
    <div className="w-full rounded-2xl border border-gray-200 bg-white/80 p-2 dark:border-white/10 dark:bg-neutral-950/30" style={{ height: '620px', width: '100%' }}>
      <AgGridReact
        ref={gridRef}
        rowData={rowData}
        theme={theme}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        onCellValueChanged={onCellValueChanged}
        onGridReady={onGridReady}
        onColumnMoved={onColumnMoved}
        onColumnResized={onColumnResized}
        onSortChanged={onSortChanged}
        suppressCellFocus={false}
        singleClickEdit={true}
        enableCellTextSelection={true}
        tooltipShowDelay={0}
        rowHeight={46}
        headerHeight={42}
        pagination={true}
        paginationPageSize={20}
        paginationPageSizeSelector={[10, 20, 50, 100, 500]}
      />
    </div>
  );
}
