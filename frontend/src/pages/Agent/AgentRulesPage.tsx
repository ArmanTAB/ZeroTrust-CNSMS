// src/pages/Agent/AgentRulesPage.tsx
import React, { useState, useEffect } from "react";
import MainLayout from "../../components/Layout/MainLayout";
import { Link } from "react-router-dom";
import AgentApi from "../../api/agent.api";
import { AgentRule, AgentRuleType } from "../../types/agent";
import { useToast } from "../../store/ToastContext";
import {
  Box,
  Button,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  CircularProgress,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import VisibilityIcon from "@mui/icons-material/Visibility";

const AgentRulesPage: React.FC = () => {
  const [rules, setRules] = useState<AgentRule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [selectedRule, setSelectedRule] = useState<AgentRule | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const data = await AgentApi.getRules();
      setRules(data);
    } catch (error) {
      console.error("Error fetching agent rules:", error);
      showToast("Failed to load rules", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (rule: AgentRule) => {
    setSelectedRule(rule);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedRule) return;

    try {
      await AgentApi.deleteRule(selectedRule._id);
      setRules(rules.filter((r) => r._id !== selectedRule._id));
      showToast("Rule deleted successfully", "success");
      setShowDeleteModal(false);
      setSelectedRule(null);
    } catch (error) {
      console.error("Error deleting rule:", error);
      showToast("Failed to delete rule", "error");
    }
  };

  // Format rule resources for display
  const formatRuleResources = (rule: AgentRule): string => {
    const resources = [];

    if (rule.resources) {
      if (rule.resources.websites && rule.resources.websites.length > 0) {
        resources.push(`${rule.resources.websites.length} websites`);
      }

      if (
        rule.resources.applications &&
        rule.resources.applications.length > 0
      ) {
        resources.push(`${rule.resources.applications.length} apps`);
      }

      if (rule.resources.files && rule.resources.files.length > 0) {
        resources.push(`${rule.resources.files.length} files`);
      }
    }

    return resources.length > 0 ? resources.join(", ") : "None";
  };

  // Format rule targets (applies to) for display
  const formatRuleTargets = (rule: AgentRule): string => {
    const targets = [];

    if (rule.appliesTo) {
      if (rule.appliesTo.users && rule.appliesTo.users.length > 0) {
        targets.push(`${rule.appliesTo.users.length} users`);
      }

      if (rule.appliesTo.departments && rule.appliesTo.departments.length > 0) {
        targets.push(`${rule.appliesTo.departments.length} departments`);
      }

      if (rule.appliesTo.roles && rule.appliesTo.roles.length > 0) {
        targets.push(`${rule.appliesTo.roles.length} roles`);
      }
    }

    return targets.length > 0 ? targets.join(", ") : "None";
  };

  return (
    <MainLayout>
      <Box sx={{ px: 4, py: 3 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 4,
          }}
        >
          <Typography variant="h4" fontWeight="bold" color="text.primary">
            Agent Rules
          </Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            component={Link}
            to="/agent/rules/new"
          >
            Add Rule
          </Button>
        </Box>

        <Paper sx={{ width: "100%", overflow: "hidden" }}>
          {loading ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                py: 8,
              }}
            >
              <CircularProgress />
            </Box>
          ) : rules.length === 0 ? (
            <Box sx={{ py: 8, textAlign: "center" }}>
              <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
                No rules found
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Get started by creating your first agent rule.
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                component={Link}
                to="/agent/rules/new"
              >
                Add Rule
              </Button>
            </Box>
          ) : (
            <TableContainer sx={{ maxHeight: "calc(100vh - 240px)" }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Resources</TableCell>
                    <TableCell>Applies To</TableCell>
                    <TableCell>Priority</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule._id} hover>
                      <TableCell>{rule.name}</TableCell>
                      <TableCell>
                        <Chip
                          label={rule.type}
                          color={
                            rule.type === AgentRuleType.ALLOW
                              ? "success"
                              : "error"
                          }
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{formatRuleResources(rule)}</TableCell>
                      <TableCell>{formatRuleTargets(rule)}</TableCell>
                      <TableCell>{rule.priority}</TableCell>
                      <TableCell>
                        <Chip
                          label={rule.isActive ? "Active" : "Inactive"}
                          color={rule.isActive ? "success" : "default"}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          component={Link}
                          to={`/agent/rules/${rule._id}/view`}
                          color="info"
                          size="small"
                          sx={{ mr: 1 }}
                        >
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          component={Link}
                          to={`/agent/rules/${rule._id}/edit`}
                          color="primary"
                          size="small"
                          sx={{ mr: 1 }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          onClick={() => handleDeleteClick(rule)}
                          color="error"
                          size="small"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Box>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">Delete Rule</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Are you sure you want to delete the rule "{selectedRule?.name}"?
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </MainLayout>
  );
};

export default AgentRulesPage;
