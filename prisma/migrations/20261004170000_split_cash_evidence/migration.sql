CREATE FUNCTION protect_split_cash_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.method = 'cash' AND OLD.reference LIKE 'cash:%' AND OLD.status = 'completed' THEN
    RAISE EXCEPTION 'Split cash payment evidence is append-only';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Payment_split_cash_append_only" BEFORE UPDATE OR DELETE ON "Payment"
FOR EACH ROW EXECUTE FUNCTION protect_split_cash_payment();

CREATE FUNCTION protect_split_cash_refund() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.provider = 'cash' AND OLD.status = 'SUCCEEDED' THEN
    RAISE EXCEPTION 'Cash refund evidence is append-only';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Refund_cash_append_only" BEFORE UPDATE OR DELETE ON "Refund"
FOR EACH ROW EXECUTE FUNCTION protect_split_cash_refund();
