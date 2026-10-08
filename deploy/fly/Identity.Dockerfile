# syntax=docker/dockerfile:1
FROM quay.io/keycloak/keycloak:26.8.0
COPY --chown=keycloak:keycloak qr-connect.json /opt/keycloak/data/import/qr-connect.json
ADD --checksum=sha256:4091dee2a1ec9e0771bef4bd46005197d86b0a2b1f25198c41738476b1d102bb --chown=keycloak:keycloak https://github.com/klausbetz/apple-identity-provider-keycloak/releases/download/1.17.0/apple-identity-provider-1.17.0.jar /opt/keycloak/providers/apple-identity-provider-1.17.0.jar
RUN /opt/keycloak/bin/kc.sh build --db=postgres --http-relative-path=/auth
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized", "--import-realm"]
