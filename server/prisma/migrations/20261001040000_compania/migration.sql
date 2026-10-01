CREATE TABLE "Compania" (
    "Codigo" VARCHAR(3) NOT NULL,
    "Nit" VARCHAR(20) NOT NULL,
    "RazonSocial" VARCHAR(250) NOT NULL,
    "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Compania_pkey" PRIMARY KEY ("Codigo"),
    CONSTRAINT "Compania_Codigo_formato_check" CHECK ("Codigo" ~ '^[0-9]{3}$'),
    CONSTRAINT "Compania_Nit_key" UNIQUE ("Nit")
);

CREATE FUNCTION "normalizarCodigoCompania"() RETURNS trigger AS $$
BEGIN
    IF NEW."Codigo" !~ '^[0-9]{1,3}$' THEN
        RAISE EXCEPTION 'El código de compañía debe contener de 1 a 3 dígitos';
    END IF;
    NEW."Codigo" := LPAD(NEW."Codigo", 3, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Compania_codigo_formato_trigger"
BEFORE INSERT OR UPDATE OF "Codigo" ON "Compania"
FOR EACH ROW EXECUTE FUNCTION "normalizarCodigoCompania"();
