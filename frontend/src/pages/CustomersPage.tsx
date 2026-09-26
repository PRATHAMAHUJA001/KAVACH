import { useTranslation } from "react-i18next";
import { Card } from "@/shared/ui";
import { useCustomers } from "@/services/api";
import { CustomerFile, CustomerFilters, CustomerTable, useCustomerParams } from "@/features/customers";

/** The portfolio: who we bank, how they score, and what is open against them. */
export default function CustomersPage() {
  const { t } = useTranslation();
  const p = useCustomerParams();
  const customers = useCustomers(p.params);

  return (
    <div className="space-y-6">
      <Card className="flex min-h-0 flex-col overflow-hidden p-0">
        <div className="space-y-3 border-b border-border p-5">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-h2 font-semibold text-fg">{t("page.customers.title")}</h2>
            {customers.data && <p className="tnum text-small text-muted">{t("customers.count", { count: customers.data.total })}</p>}
          </div>
          <CustomerFilters
            q={p.q}
            segment={p.segment}
            risk={p.risk}
            sort={p.sort}
            segments={customers.data?.segments ?? []}
            onChange={p.update}
          />
        </div>
        <CustomerTable
          data={customers.data}
          isLoading={customers.isLoading}
          isError={customers.isError}
          isFetching={customers.isFetching}
          onRetry={() => void customers.refetch()}
          onOpen={p.openCustomer}
          onPage={(page) => p.update({ page: String(page) })}
          onClearFilters={p.filtered ? () => p.update({ q: null, segment: null, risk: null, sort: null }) : undefined}
        />
      </Card>
      <CustomerFile customerId={p.customerId} onClose={p.closeCustomer} />
    </div>
  );
}
