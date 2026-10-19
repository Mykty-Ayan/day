import { createFileRoute } from '@tanstack/react-router'
import ExpensesPage from '../../pages/expenses/ExpensesPage'

export const Route = createFileRoute('/expenses/')({
  component: ExpensesPage,
})
